import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, relative, join } from "node:path";
import {
  resolveBlocks,
  type ThemeConfigForResolver,
} from "../../../packages/theme-contract/resolver/resolveBlocks";
import { THEME_PUCK_BASE_BLOCKS } from "../theme-puck-block-catalog";
import { resolveBlockArtifact } from "../block-artifact-resolver";
import { BLOCK_ASSEMBLY_DESTINATIONS } from "../../generator/block-assembly-layout";
import { validateBlock } from "../../../packages/theme-contract/validators/validateBlock";
import { validateThemeV2 } from "../../../packages/theme-contract/validators/validateTheme.v2";
import { buildPreviewCartDemoScript } from "../preview-cart-contract";
import { resolveCartDrawerGlobals } from "../cart-drawer-contract";
import { bloomRegistry } from "../../generator/registries/bloom";
import type {
  ThemeSourceSnapshot,
  PhysicalBlockRecord,
  BlockPolicyCode,
  BlockAnatomy,
  CompiledModuleRecord,
} from "./source-types";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const IMPORT_CHECKER = resolve(__dirname, "check-compiled-imports.mjs");

/**
 * Batch import-check compiled ESM `.mjs` modules in a child node process.
 * jest (CJS, no --experimental-vm-modules) cannot import them in-process.
 * Success = a REAL default export ({} import = failure).
 */
function checkCompiledModules(absPaths: string[]): CompiledModuleRecord[] {
  const stdout = execFileSync(
    "node",
    [IMPORT_CHECKER, JSON.stringify(absPaths)],
    { encoding: "utf-8", cwd: SITES_ROOT },
  );
  const results = JSON.parse(stdout) as Array<{
    path: string;
    exists: boolean;
    defaultExport: boolean;
    namedExports: string[];
    failure?: "missing" | "no-default" | "import-error";
  }>;
  return results.map((r) => ({
    module: relative(SITES_ROOT, r.path),
    defaultExport: r.defaultExport,
    namedExports: r.namedExports ?? [],
    ...(r.failure ? { failure: r.failure } : {}),
  }));
}

/** Read a file, suppressing ONLY ENOENT (invalid JSON / import errors stay). */
function readOptional(path: string): Buffer | null {
  try {
    return readFileSync(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw err;
  }
}

function sha256(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Recursively list tracked files under a dir (bytes-hashable), excluding dumps. */
function listFiles(dir: string, exclude: RegExp[] = []): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (exclude.some((re) => re.test(full))) continue;
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else out.push(full);
    }
  };
  walk(dir);
  return out.sort();
}

const DIGEST_EXCLUDES = [
  /node_modules/,
  /[/\\]dist[/\\]/,
  /conformance[/\\]inventory[/\\]/,
  /conformance[/\\]baselines[/\\]/,
  /conformance-results[/\\]/,
  /\.DS_Store$/,
];

/** Normalize a validateBlock message into a stable policy code (F-041). */
function classifyPolicyMessage(msg: string): BlockPolicyCode | null {
  if (/Missing required file/i.test(msg)) return null; // anatomy represents it
  if (/\.tsx/i.test(msg)) return "forbidden-tsx";
  if (/Hex color/i.test(msg)) return "color-hex";
  if (/rgb/i.test(msg)) return "color-rgb";
  if (/hsl/i.test(msg)) return "color-hsl";
  return "unclassified";
}

function missingFilesFrom(errors: string[]): string[] {
  return errors
    .filter((e) => /Missing required file/i.test(e))
    .map((e) => e.replace(/^Missing required file:\s*/i, "").trim())
    .sort();
}

function blockAnatomy(dir: string, name: string): BlockAnatomy {
  const has = (f: string) => existsSync(join(dir, f));
  return {
    puckConfig: has(`${name}.puckConfig.ts`),
    tokens: has(`${name}.tokens.ts`),
    classes: has(`${name}.classes.ts`),
    astro: has(`${name}.astro`),
    index: has("index.ts"),
  };
}

/** Enumerate physical blocks for a location, keyed by (location,name). */
async function physicalBlocksFor(
  pkgDir: string,
  location: "blocks" | "customBlocks",
): Promise<PhysicalBlockRecord[]> {
  const root = join(pkgDir, location);
  if (!existsSync(root)) return [];
  const out: PhysicalBlockRecord[] = [];
  for (const name of readdirSync(root).sort()) {
    const dir = join(root, name);
    if (!statSync(dir).isDirectory()) continue;
    const result = await validateBlock(dir);
    const classified: BlockPolicyCode[] = [];
    for (const e of result.errors) {
      const code = classifyPolicyMessage(e);
      if (code !== null) classified.push(code);
    }
    const codes: BlockPolicyCode[] = Array.from(new Set(classified)).sort();
    out.push({
      location,
      name,
      dir: relative(SITES_ROOT, dir),
      anatomy: blockAnatomy(dir, name),
      policy: {
        ok: result.ok,
        codes,
        missingFiles: missingFilesFrom(result.errors),
      },
    });
  }
  return out;
}

/**
 * Load the real Bloom source + compiled snapshot. Deterministic: volatile
 * metadata (manifest compiledAt, absolute paths in compiled .mjs) is never
 * serialized; source digests hash the original repo bytes.
 */
export async function loadThemeSourceSnapshot(
  themeId = "bloom",
  opts: { reviewedRequirementsFixture?: Buffer | null } = {},
): Promise<ThemeSourceSnapshot> {
  const pkgDir = resolve(SITES_ROOT, "packages", `theme-${themeId}`);
  const themeDir = resolve(SITES_ROOT, "themes", themeId);

  // --- theme.json (post-validate; pages/blockDefaults retained via raw read) ---
  const themeJsonRaw = readFileSync(join(pkgDir, "theme.json"), "utf-8");
  const themeJson = JSON.parse(themeJsonRaw);

  // --- validateThemeV2 (real package; may be non-ok per F-043) ---
  const themeValidation = await validateThemeV2(pkgDir);

  // --- page slugs + checkout-result presence ---
  const pages: Array<{ slug?: string; id?: string }> = Array.isArray(
    themeJson.pages,
  )
    ? themeJson.pages
    : [];
  const pageSlugs = pages
    .map((p) => (typeof p.slug === "string" ? p.slug : ""))
    .filter(Boolean)
    .sort();
  const pagesBlob = JSON.stringify(pages);
  const hasCheckoutResultPage =
    /checkout-result/.test(pagesBlob) || /OrderConfirmation/.test(pagesBlob);

  // --- canonical block resolutions (extracted resolver) ---
  const manifest: ThemeConfigForResolver = {
    blocks: themeJson.blocks ?? {},
    features: themeJson.features ?? {},
    customBlocks: themeJson.customBlocks ?? {},
  };
  const resolved = resolveBlocks(THEME_PUCK_BASE_BLOCKS, manifest);
  const resolutions = Object.entries(resolved)
    .map(([name, entry]) => {
      const ref = resolveBlockArtifact(themeId, (entry as any).path);
      return {
        name,
        source: (entry as any).source,
        path: (entry as any).path,
        pkg: ref.pkg,
        loaderArtifact: ref.artifact,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // --- physical blocks (both locations, keyed by (location,name)) ---
  const physicalBlocks = [
    ...(await physicalBlocksFor(pkgDir, "blocks")),
    ...(await physicalBlocksFor(pkgDir, "customBlocks")),
  ];

  // --- generator registry reachability ---
  const registry = Object.entries(bloomRegistry)
    .map(([name, entry]) => {
      const importPath = (entry as any).importPath as string;
      // ../components/<X>.astro → src/components destination (blocks mapping).
      const isComponents = importPath.includes("../components/");
      const assemblerDestination = isComponents
        ? BLOCK_ASSEMBLY_DESTINATIONS.blocks
        : importPath.includes("../customBlocks/")
          ? BLOCK_ASSEMBLY_DESTINATIONS.customBlocks
          : "unknown";
      const physBase = existsSync(
        join(pkgDir, "blocks", name, `${name}.astro`),
      );
      return {
        name,
        importPath,
        assemblerDestination,
        physicalSourcePresent: physBase,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // --- required Bloom runtime source files (theme-base runtime) ---
  const runtimeDir = resolve(SITES_ROOT, "packages", "theme-base", "runtime");
  const runtimeSources = existsSync(runtimeDir)
    ? readdirSync(runtimeDir)
        .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
        .map((f) => relative(SITES_ROOT, join(runtimeDir, f)))
        .sort()
    : [];

  // --- standalone live output presence (index.html) ---
  const standaloneOutputs = {
    liveIndexHtml: existsSync(
      resolve(SITES_ROOT, "dist", "theme-live", themeId, "index.html"),
    ),
    themeDistIndexHtml: existsSync(resolve(themeDir, "dist", "index.html")),
  };

  // --- compiled modules: Puck loader index (Catalog base-resolved) + mapped Publications ---
  const distAstroBlocks = resolve(SITES_ROOT, "dist", "astro-blocks");
  const distThemeSections = resolve(
    SITES_ROOT,
    "dist",
    "theme-sections",
    themeId,
  );
  const modulesToCheck: string[] = [];
  // Catalog resolves to base → theme-base__Catalog__index.mjs (controller Puck index).
  const catalogRef = resolveBlockArtifact(themeId, "Catalog");
  modulesToCheck.push(join(distAstroBlocks, catalogRef.artifact));
  // Benefits is a theme-bloom physical block; its compiled loader index.
  modulesToCheck.push(
    join(distAstroBlocks, "theme-bloom__Benefits__index.mjs"),
  );
  // Read the compiled theme-section manifest ONCE (authority for mapped
  // renderers — the exact modules the live/preview pipeline imports).
  let publicationsModule = "";
  const sectionManifestBuf = readOptional(
    join(distThemeSections, "manifest.json"),
  );
  const sectionManifest: Record<string, string> = sectionManifestBuf
    ? (JSON.parse(sectionManifestBuf.toString("utf-8")) as Record<
        string,
        string
      >)
    : {};
  // Mapped Publications section module (from the section manifest).
  if (sectionManifest.Publications) {
    publicationsModule = relative(
      SITES_ROOT,
      join(distThemeSections, sectionManifest.Publications),
    );
    modulesToCheck.push(
      join(distThemeSections, sectionManifest.Publications),
    );
  }

  // --- renderer reachability: import-check EVERY generator-registry renderer ---
  // Resolve each registry renderer to its REAL compiled artifact and mark it
  // reachable only on a genuine default export (F-052). A mapped renderer
  // (present in the compiled section manifest) resolves to
  // `dist/theme-sections/<theme>/<file>.mjs`; an unmapped renderer resolves via
  // `resolveBlockArtifact` to `dist/astro-blocks/<pkg>__<Block>__<Block>.mjs`
  // (the compiled `.astro` component with the default export — NOT the
  // `__index.mjs` Puck-config module). A theme package that physically owns the
  // block (e.g. theme-bloom/blocks/Benefits) routes to its theme override,
  // exactly like a `./blocks/<Name>` manifest override; everything else routes
  // to theme-base. A renderer whose compiled module genuinely fails to import /
  // lacks a default export is omitted, so it stays a real GAP.
  const rendererArtifacts = Object.keys(bloomRegistry)
    .sort()
    .map((name) => {
      const mapped = sectionManifest[name];
      if (mapped) {
        return { name, abs: join(distThemeSections, mapped) };
      }
      // Unmapped: theme-owned iff a physical block source exists in the theme
      // package, mirroring resolveBlockArtifact's `./blocks/<Name>` routing.
      const themeOwned = existsSync(
        join(pkgDir, "blocks", name, `${name}.astro`),
      );
      const ref = resolveBlockArtifact(
        themeId,
        themeOwned ? `./blocks/${name}` : name,
      );
      const rendererArtifact = `${ref.pkg}__${ref.blockName}__${ref.blockName}.mjs`;
      return { name, abs: join(distAstroBlocks, rendererArtifact) };
    });
  const rendererChecks = checkCompiledModules(
    rendererArtifacts.map((r) => r.abs),
  );
  const renderersReachable = rendererArtifacts
    .filter((_, i) => rendererChecks[i]?.defaultExport === true)
    .map((r) => r.name)
    .sort();

  const compiledModules = checkCompiledModules(modulesToCheck).sort((a, b) =>
    a.module.localeCompare(b.module),
  );

  // --- generated Bloom preview-cart script + digest ---
  const script = buildPreviewCartDemoScript("__SITE__", themeId);
  const scriptDigest = sha256(script);

  // --- cart-drawer descriptor (fixed fixture) + call-site reachability ---
  const cartFixture = {
    pagesData: {
      "page-cart": {
        content: [{ type: "CartBody", props: { colorScheme: "scheme-2" } }],
      },
    },
    themeSettings: { cartDrawerTitle: "Корзина" },
  };
  const cartDrawer = {
    globals: resolveCartDrawerGlobals(cartFixture),
    // Observed on the target ref (F-053): globals reach v2-sections + live
    // build, but NOT the built-theme blob preview path.
    reachability: { v2Sections: true, builtTheme: false, liveBuild: true },
  };

  // --- deterministic source digests over tracked repo bytes + module identity ---
  const digestFiles = [
    ...listFiles(pkgDir, DIGEST_EXCLUDES),
    ...listFiles(themeDir, DIGEST_EXCLUDES),
    ...listFiles(runtimeDir, DIGEST_EXCLUDES),
    // extracted pipeline helpers + resolver/validator/controller/generator sources
    resolve(SITES_ROOT, "scripts", "lib", "block-source-layout.mjs"),
    resolve(SITES_ROOT, "src", "themes", "block-artifact-resolver.ts"),
    resolve(SITES_ROOT, "src", "generator", "block-assembly-layout.ts"),
    resolve(SITES_ROOT, "src", "themes", "cart-drawer-contract.ts"),
    resolve(SITES_ROOT, "src", "themes", "preview-cart-contract.ts"),
    resolve(SITES_ROOT, "src", "themes", "theme-puck-block-catalog.ts"),
    resolve(
      SITES_ROOT,
      "src",
      "controllers",
      "theme-puck-config.controller.ts",
    ),
    resolve(SITES_ROOT, "src", "controllers", "preview.controller.ts"),
    resolve(SITES_ROOT, "src", "generator", "assemble-from-packages.ts"),
    resolve(SITES_ROOT, "src", "generator", "build.service.ts"),
    resolve(SITES_ROOT, "src", "generator", "registries", "bloom.ts"),
    resolve(SITES_ROOT, "src", "themes", "page-blocks.ts"),
    resolve(SITES_ROOT, "scripts", "compile-astro-blocks.mjs"),
    resolve(SITES_ROOT, "scripts", "compile-theme-sections.mjs"),
    // conformance generator inputs (exclude generated inventory/baselines)
    ...listFiles(
      resolve(SITES_ROOT, "packages", "theme-contract", "conformance"),
      DIGEST_EXCLUDES,
    ),
    ...listFiles(
      resolve(SITES_ROOT, "src", "themes", "conformance"),
      DIGEST_EXCLUDES,
    ),
    // workspace/lock/dockerfile/manifests
    resolve(SITES_ROOT, "pnpm-workspace.yaml"),
    resolve(SITES_ROOT, "pnpm-lock.yaml"),
    resolve(SITES_ROOT, "Dockerfile"),
    resolve(SITES_ROOT, "package.json"),
  ];
  const uniqueSorted = Array.from(new Set(digestFiles)).sort();

  const sourceDigests: Record<string, string> = {};
  for (const f of uniqueSorted) {
    const buf = readOptional(f);
    if (buf === null) continue; // ENOENT-tolerant
    sourceDigests[relative(SITES_ROOT, f)] = sha256(buf);
  }
  // Compiled artifacts contribute ONLY sorted repo-relative module identity +
  // import outcome (never their bytes — they embed absolute paths).
  for (const m of compiledModules) {
    sourceDigests[`compiled:${m.module}`] = sha256(
      `${m.module}:${m.defaultExport}:${m.namedExports.join(",")}:${m.failure ?? ""}`,
    );
  }
  // Reviewed requirements artifact: before Task 8 creates it, snapshot tests use
  // an injected fixture; its bytes participate in the digest when provided.
  if (opts.reviewedRequirementsFixture) {
    sourceDigests["reviewed:requirements"] = sha256(
      opts.reviewedRequirementsFixture,
    );
  }

  // Rolled-up digest over the sorted (path → digest) pairs.
  const sourceDigest = sha256(
    Object.keys(sourceDigests)
      .sort()
      .map((k) => `${k}:${sourceDigests[k]}`)
      .join("\n"),
  );

  return {
    themeId,
    themeJson,
    themeValidation,
    pageSlugs,
    hasCheckoutResultPage,
    resolutions,
    physicalBlocks,
    registry,
    renderersReachable,
    runtimeSources,
    standaloneOutputs,
    compiledModules,
    publications: { module: publicationsModule, probes: [] },
    previewCart: { script, scriptDigest },
    cartDrawer,
    sourceDigests,
    sourceDigest,
  };
}

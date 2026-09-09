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
import { satinRegistry } from "../../generator/registries/satin";
import type { ComponentRegistryEntry } from "../../generator/page-generator";
import { getThemeSourceAdapter } from "./source-adapters";
import type {
  ThemeSourceSnapshot,
  PhysicalBlockRecord,
  BlockPolicyCode,
  BlockAnatomy,
  CompiledModuleRecord,
  SectionsMapRecord,
  RequiredRuntimeSourceRecord,
  StandaloneRouteRecord,
} from "./source-types";

/**
 * Theme → generator registry. The snapshot resolves the registry for the
 * requested theme; a theme name can only select a registered registry, never an
 * arbitrary module path. Bloom uses `bloomRegistry`, Satin uses `satinRegistry`.
 */
const THEME_REGISTRIES: Record<string, Record<string, ComponentRegistryEntry>> = {
  bloom: bloomRegistry,
  satin: satinRegistry,
};

function resolveThemeRegistry(
  themeId: string,
): Record<string, ComponentRegistryEntry> {
  const reg = THEME_REGISTRIES[themeId];
  if (!reg) throw new Error(`no generator registry registered for theme "${themeId}"`);
  return reg;
}

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
  // Resolve the theme's source adapter (digest partition + required sources) and
  // its generator registry. A theme name can only select a registered adapter/
  // registry, never an arbitrary filesystem root.
  const adapter = getThemeSourceAdapter(themeId);
  const registryMap = resolveThemeRegistry(themeId);

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
  const registry = Object.entries(registryMap)
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

  // --- required runtime source presence (adapter-declared subset) ---
  // Every adapter-declared required source is recorded with its presence. A
  // missing source is a REPORTED structural fact, never silently dropped.
  const requiredRuntimeSources: RequiredRuntimeSourceRecord[] = [
    ...adapter.requiredRuntimeSources,
  ]
    .sort()
    .map((p) => ({ path: p, present: existsSync(resolve(SITES_ROOT, p)) }));

  // --- standalone Astro/JS route tree (recursive, dynamic segments kept) ---
  const pagesRoot = resolve(themeDir, "src", "pages");
  const standaloneRoutes: StandaloneRouteRecord[] = listFiles(pagesRoot)
    .filter((f) => /\.(astro|js)$/.test(f))
    .map((f) => {
      const rel = relative(SITES_ROOT, f);
      return { file: rel, dynamic: /\[[^\]]+\]/.test(rel) };
    })
    .sort((a, b) => a.file.localeCompare(b.file));

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
  // Benefits is a theme-bloom-owned physical block; its compiled loader index is
  // a Bloom-specific probe (Satin has no Benefits block, so this probe is
  // Bloom-only — it never fabricates a `missing` compiled module for Satin).
  if (themeId === "bloom") {
    modulesToCheck.push(
      join(distAstroBlocks, "theme-bloom__Benefits__index.mjs"),
    );
  }
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
  const rendererArtifacts = Object.keys(registryMap)
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

  // --- sections-map reachability (standalone sections.map.json) ---------------
  // Load the theme's standalone `sections.map.json` and, for each of its keys,
  // record its source mapping, whether the source file exists, the exact
  // compiled section module the manifest names, and whether that EXACT mapped
  // Satin renderer imports with a genuine default export. A mapped block is
  // proved reachable ONLY by its own compiled section module — a passing base
  // renderer can never mask a mapped-renderer failure. Empty for Bloom (Bloom
  // has no sections.map.json).
  const sectionsMapBuf = readOptional(
    resolve(SITES_ROOT, adapter.sectionMapPath),
  );
  const sectionsMapRaw: Record<string, string> = sectionsMapBuf
    ? (JSON.parse(sectionsMapBuf.toString("utf-8")) as Record<string, string>)
    : {};
  const sectionsMapKeys = Object.keys(sectionsMapRaw).sort();
  const sectionsMapAbs = sectionsMapKeys.map((name) => {
    const mapped = sectionManifest[name];
    return mapped ? join(distThemeSections, mapped) : "";
  });
  const sectionsMapChecks = checkCompiledModules(
    sectionsMapAbs.map((p) => p || join(distThemeSections, "__missing__.mjs")),
  );
  const sectionsMap: SectionsMapRecord[] = sectionsMapKeys.map((name, i) => {
    const sourceTarget = sectionsMapRaw[name];
    const mapped = sectionManifest[name];
    return {
      name,
      sourceTarget,
      compiledModule: mapped
        ? relative(SITES_ROOT, join(distThemeSections, mapped))
        : null,
      sourceExists: existsSync(resolve(themeDir, sourceTarget)),
      mappedRendererReachable:
        !!mapped && sectionsMapChecks[i]?.defaultExport === true,
    };
  });

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

  // --- deterministic source digests: EXPLICIT provenance partition ------------
  // The digest inputs come from the theme's source adapter, split into a shared
  // core (identical across bloom/satin) and a theme-owned list (only the
  // selected theme's files). No directory is hashed merely because it contains
  // conformance code: the broad `src/themes/conformance/**` glob the landed
  // Bloom loader used is replaced ONCE with this explicit partition. A directory
  // entry is hashed recursively (excluding node_modules/dist/generated dumps); a
  // file entry is hashed directly. Every read is ENOENT-tolerant so pre-Task-3
  // normative artifacts (which do not exist yet) do not fake a failure.
  const expandDigestEntry = (entry: string): string[] => {
    const abs = resolve(SITES_ROOT, entry);
    if (existsSync(abs) && statSync(abs).isDirectory()) {
      return listFiles(abs, DIGEST_EXCLUDES);
    }
    return [abs];
  };
  const sharedFiles = adapter.sharedDigestInputs.flatMap(expandDigestEntry);
  const themeFiles = adapter.themeDigestInputs.flatMap(expandDigestEntry);
  const uniqueSorted = Array.from(new Set([...sharedFiles, ...themeFiles])).sort();

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
    requiredRuntimeSources,
    sectionsMap,
    standaloneRoutes,
    standaloneOutputs,
    compiledModules,
    publications: { module: publicationsModule, probes: [] },
    previewCart: { script, scriptDigest },
    cartDrawer,
    sourceDigests,
    sourceDigest,
  };
}

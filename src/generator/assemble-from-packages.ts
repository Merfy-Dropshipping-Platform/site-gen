/**
 * Assemble-from-packages — Phase 3a new-path assembler (flag-gated).
 *
 * PURPOSE
 * =======
 * Replacement for the legacy `templates/astro/<theme>/` copy flow in scaffold-builder.
 * Reads the new `packages/theme-<name>/` workspace packages and assembles an Astro
 * project directory ready for `astro build`.
 *
 * GATING
 * ======
 * Activated ONLY when `BUILD_USE_NEW_PACKAGES=true`. Default OFF.
 * Legacy path (`templates/astro/<theme>` copy) remains the production default.
 *
 * LAYERED ASSEMBLY
 * ================
 * 1. Base pass: copy files from `packages/theme-base/` (layouts, blocks, seo, fonts, etc.)
 * 2. Theme pass: copy theme-specific files from `packages/theme-<name>/`
 *    (blocks, assets, styles) — overrides any base files with the same relative path.
 * 3. Tokens: read `packages/theme-<name>/tokens.json` and emit `src/styles/tokens.css`.
 *
 * This module is intentionally minimal for Phase 3a. Step-by-step implementation
 * status is marked inline with `PHASE3A-STATUS`.
 *
 * NOT IN THIS PHASE (Phase 3b/3c):
 * - Deletion of `templates/astro/*`
 * - Default flag flip
 * - Production canary sites
 */

import * as fs from "fs/promises";
import * as path from "path";
import { buildTokensCss } from "../themes/tokens-css";

/**
 * Env-var flag for new assembly path.
 * Checked by scaffold-builder to decide which branch to run.
 */
export function isNewPackagesFlagEnabled(): boolean {
  return (process.env.BUILD_USE_NEW_PACKAGES ?? "false").toLowerCase() === "true";
}

/**
 * Options for the new-path assembler.
 */
export interface AssembleOptions {
  /** Theme name — e.g. "rose", "vanilla", "bloom" */
  themeName: string;
  /** Output directory where the assembled Astro project goes */
  outputDir: string;
  /**
   * Override for packages root (absolute path).
   * Defaults to `<sites-service>/packages`.
   * Useful for tests.
   */
  packagesRoot?: string;
  /**
   * Merchant's theme customizations (typically `revision.data.themeSettings`).
   * Used by the shared `buildTokensCss` generator to emit the same CSS that
   * the preview iframe uses. When omitted, theme defaults (from manifest)
   * still win — parity is preserved.
   *
   * Shape: Constructor's ThemeSettings — `{ colorSchemes, buttonRadius,
   * headingFont, ... }`. See `src/themes/tokens-css.ts` for the full list
   * of fields consumed.
   */
  themeSettings?: Record<string, unknown>;
}

/**
 * Result of the assembler.
 */
export interface AssembleResult {
  /** Absolute path to the assembled directory (== outputDir) */
  outputDir: string;
  /** Relative paths of files copied/generated */
  generatedFiles: string[];
  /** Warnings encountered during assembly (missing optional dirs, etc.) */
  warnings: string[];
  /** True if a base package was found and copied */
  baseCopied: boolean;
  /** True if theme package files were copied */
  themeCopied: boolean;
  /** True if tokens.css was generated from tokens.json */
  tokensCssGenerated: boolean;
}

const COPY_SKIP = new Set([
  "node_modules",
  "dist",
  ".astro",
  "__tests__",
  "__snapshots__",
  "test-results",
  "coverage",
]);

/** File extensions we skip when copying (TS test/config not needed at runtime) */
const FILE_SKIP_PATTERNS = [
  /\.spec\.ts$/,
  /\.test\.ts$/,
  /jest\.config\.ts$/,
  /playwright\.config\.ts$/,
  /tsconfig\.json$/,
];

function shouldSkipFile(name: string): boolean {
  return FILE_SKIP_PATTERNS.some((pat) => pat.test(name));
}

async function dirExists(p: string): Promise<boolean> {
  try {
    const s = await fs.stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    const s = await fs.stat(p);
    return s.isFile();
  } catch {
    return false;
  }
}

async function copyRecursive(
  src: string,
  dest: string,
  tracked: string[],
  baseForRel: string,
): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    if (COPY_SKIP.has(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyRecursive(srcPath, destPath, tracked, baseForRel);
    } else {
      if (shouldSkipFile(entry.name)) continue;
      await fs.copyFile(srcPath, destPath);
      tracked.push(path.relative(baseForRel, destPath));
    }
  }
}

/**
 * Copy the theme's curated `package.json` from templates/astro/<themeName>/.
 * Carries the full dependency set (@tanstack/react-query, glightbox,
 * testing tooling) the legacy scaffold needs. scaffold-builder.ts will
 * skip its own package.json generation because this file already exists.
 *
 * PHASE3A-STATUS: BRIDGE
 */
async function copyLegacyPackageJson(
  themeName: string,
  outputDir: string,
  tracked: string[],
  warnings: string[],
): Promise<void> {
  const src = path.join(
    process.cwd(),
    "templates",
    "astro",
    themeName,
    "package.json",
  );
  if (!(await fileExists(src))) {
    warnings.push(`[assemble] no legacy package.json at ${src}`);
    return;
  }
  const dest = path.join(outputDir, "package.json");
  await fs.copyFile(src, dest);
  tracked.push(path.relative(outputDir, dest));
}

/**
 * Copy the legacy `templates/astro/<themeName>/src/` scaffold into
 * `<outputDir>/src/`. Bridges the gap until Phase 3d migrates pages,
 * auxiliary components (auth/, react/ islands), data fixtures, and
 * scripts into `packages/theme-<name>/`.
 *
 * Why the full src/ and not just pages/: routes like /catalog, /login,
 * /account import non-block components (AuthShell, CatalogIsland,
 * auth/AuthButton, etc.) that live only in templates/. Without them the
 * Astro build fails with "Could not resolve …" errors.
 *
 * Order: this runs BEFORE the package base/theme overlays so the new
 * packages still win for block components (Header.astro, Footer.astro,
 * …) and layouts. Everything else (pages, auth/, react/, data/, scripts/)
 * stays legacy until it migrates.
 *
 * PHASE3A-STATUS: BRIDGE (remove after Phase 3d migrates static pages
 * and auxiliary components into packages/theme-<name>/)
 */
async function copyLegacyScaffold(
  themeName: string,
  outputDir: string,
  tracked: string[],
  warnings: string[],
): Promise<void> {
  const src = path.join(
    process.cwd(),
    "templates",
    "astro",
    themeName,
    "src",
  );
  if (!(await dirExists(src))) {
    warnings.push(
      `[assemble] no legacy scaffold at ${src} — static routes and auxiliary components will not resolve`,
    );
    return;
  }
  const dest = path.join(outputDir, "src");
  await copyRecursive(src, dest, tracked, outputDir);
}

/**
 * Copy layouts from `packages/theme-base/layouts/` → `<outputDir>/src/layouts/`.
 *
 * PHASE3A-STATUS: IMPLEMENTED
 */
async function copyBaseLayouts(
  packagesRoot: string,
  outputDir: string,
  tracked: string[],
  warnings: string[],
): Promise<void> {
  const src = path.join(packagesRoot, "theme-base", "layouts");
  if (!(await dirExists(src))) {
    warnings.push(`theme-base/layouts not found at ${src}`);
    return;
  }
  const dest = path.join(outputDir, "src", "layouts");
  await copyRecursive(src, dest, tracked, outputDir);
}

/**
 * Copy SEO modules from `packages/theme-base/seo/` → `<outputDir>/src/seo/`.
 *
 * PHASE3A-STATUS: IMPLEMENTED
 */
async function copyBaseSeo(
  packagesRoot: string,
  outputDir: string,
  tracked: string[],
  warnings: string[],
): Promise<void> {
  const src = path.join(packagesRoot, "theme-base", "seo");
  if (!(await dirExists(src))) {
    warnings.push(`theme-base/seo not found at ${src}`);
    return;
  }
  const dest = path.join(outputDir, "src", "seo");
  await copyRecursive(src, dest, tracked, outputDir);
}

/**
 * Copy blocks from a package's `blocks/<BlockName>/<BlockName>.astro`
 * into `<outputDir>/src/components/<BlockName>.astro`.
 *
 * Also copies companion `.classes.ts`, `.tokens.ts`, `.variants.ts` if present
 * (the existing build pipeline consumes them).
 *
 * PHASE3A-STATUS: IMPLEMENTED (simple astro-only copy; complex import rewrites
 *                  are deferred — see below)
 */
async function copyBlocksFromPackage(
  pkgDir: string,
  outputDir: string,
  tracked: string[],
  overwrite: boolean,
): Promise<string[]> {
  const blocksRoot = path.join(pkgDir, "blocks");
  if (!(await dirExists(blocksRoot))) return [];
  const componentsDir = path.join(outputDir, "src", "components");
  await fs.mkdir(componentsDir, { recursive: true });
  const copiedBlocks: string[] = [];
  const blockDirs = await fs.readdir(blocksRoot, { withFileTypes: true });
  for (const bd of blockDirs) {
    if (!bd.isDirectory()) continue;
    if (COPY_SKIP.has(bd.name)) continue;
    // Skip inventory docs & misc files
    if (bd.name === "BLOCK_INVENTORY.md") continue;
    const blockSrcDir = path.join(blocksRoot, bd.name);
    const astroFile = path.join(blockSrcDir, `${bd.name}.astro`);
    const hasAstro = await fileExists(astroFile);
    const destAstro = path.join(componentsDir, `${bd.name}.astro`);
    const astroAlready = await fileExists(destAstro);

    if (hasAstro && (overwrite || !astroAlready)) {
      await fs.copyFile(astroFile, destAstro);
      tracked.push(path.relative(outputDir, destAstro));
    }

    // Copy companion files (.classes.ts, .tokens.ts, .variants.ts, etc.)
    // Theme override packages may ship ONLY companions (no .astro) so the
    // unified base .astro picks up the theme-specific classes map. Copy
    // them regardless of whether this package has the .astro itself.
    const companions = await fs.readdir(blockSrcDir);
    for (const file of companions) {
      if (file === `${bd.name}.astro`) continue;
      if (shouldSkipFile(file)) continue;
      const srcPath = path.join(blockSrcDir, file);
      const stat = await fs.stat(srcPath);
      if (!stat.isFile()) continue;
      const destPath = path.join(componentsDir, file);
      const destExists = await fileExists(destPath);
      if (destExists && !overwrite) continue;
      await fs.copyFile(srcPath, destPath);
      tracked.push(path.relative(outputDir, destPath));
    }

    if (hasAstro || (await fs.readdir(blockSrcDir)).length > 0) {
      copiedBlocks.push(bd.name);
    }
  }
  return copiedBlocks;
}

/**
 * Copy theme-specific customBlocks/ directory if present.
 *
 * PHASE3A-STATUS: IMPLEMENTED
 */
async function copyCustomBlocks(
  pkgDir: string,
  outputDir: string,
  tracked: string[],
): Promise<void> {
  const src = path.join(pkgDir, "customBlocks");
  if (!(await dirExists(src))) return;
  const dest = path.join(outputDir, "src", "customBlocks");
  await copyRecursive(src, dest, tracked, outputDir);
}

/**
 * Copy theme assets (images, static) if present.
 *
 * PHASE3A-STATUS: IMPLEMENTED
 */
async function copyAssets(
  pkgDir: string,
  outputDir: string,
  tracked: string[],
): Promise<void> {
  const assetSrc = path.join(pkgDir, "assets");
  if (await dirExists(assetSrc)) {
    const assetDest = path.join(outputDir, "public", "assets");
    await copyRecursive(assetSrc, assetDest, tracked, outputDir);
  }

  const fontSrc = path.join(pkgDir, "fonts");
  if (await dirExists(fontSrc)) {
    const fontDest = path.join(outputDir, "public", "fonts");
    await copyRecursive(fontSrc, fontDest, tracked, outputDir);
  }

  // Copy public/ files (e.g. logo.svg, favicon.svg) to outputDir/public/ root.
  // Needed so merchant headers referencing `/logo.svg` resolve on live site.
  const publicSrc = path.join(pkgDir, "public");
  if (await dirExists(publicSrc)) {
    const publicDest = path.join(outputDir, "public");
    await copyRecursive(publicSrc, publicDest, tracked, outputDir);
  }
}

/**
 * Copy theme styles (global.css, tokens.css, etc) if present.
 *
 * PHASE3A-STATUS: IMPLEMENTED
 */
async function copyStyles(
  pkgDir: string,
  outputDir: string,
  tracked: string[],
): Promise<void> {
  const src = path.join(pkgDir, "styles");
  if (!(await dirExists(src))) return;
  const dest = path.join(outputDir, "src", "styles");
  await copyRecursive(src, dest, tracked, outputDir);
}

/**
 * Generate tokens.css from tokens.json using the v2 tokens format
 * (design-tokens.github.io community group format).
 *
 * PHASE3A-STATUS: STUB — full conversion deferred to Phase 3b.
 *                  Currently emits a minimal :root {} with flat var names
 *                  derived from the tokens.json. Full nested + color-scheme
 *                  support reuses generateTokensCss() from tokens-generator.ts.
 */
export function generateTokensCssV2(tokensJson: unknown): string {
  if (!tokensJson || typeof tokensJson !== "object") return ":root {}\n";
  const lines: string[] = [":root {"];

  const walk = (obj: Record<string, unknown>, prefix: string[]) => {
    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith("$")) continue;
      if (value && typeof value === "object") {
        const v = value as Record<string, unknown>;
        if ("$value" in v && typeof v["$value"] === "string") {
          const name = [...prefix, key].join("-");
          lines.push(`  --${name}: ${v["$value"]};`);
        } else {
          walk(v, [...prefix, key]);
        }
      }
    }
  };

  walk(tokensJson as Record<string, unknown>, []);
  lines.push("}");
  return lines.join("\n") + "\n";
}

async function readJsonSafe(filePath: string): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Emit src/styles/tokens.css using the shared `buildTokensCss` generator
 * (same one the preview iframe uses). This gives the live build byte-for-byte
 * identical CSS to what the constructor's preview shows for the same
 * themeSettings + themeId.
 *
 * Source precedence inside buildTokensCss:
 *   1. Theme manifest defaults (from packages/theme-<name>/theme.json)
 *   2. Merchant themeSettings colorSchemes (constructor customizations)
 *   3. Hardcoded Phase 0 fallbacks
 *
 * If no themeSettings is supplied, defaults from the manifest drive the output.
 */
async function generateTokensFromTheme(
  themeName: string,
  outputDir: string,
  tracked: string[],
  warnings: string[],
  themeSettings?: Record<string, unknown>,
): Promise<boolean> {
  const css = buildTokensCss(themeSettings ?? null, themeName);
  if (!css || css.trim().length === 0) {
    warnings.push(`buildTokensCss produced empty output for theme "${themeName}"`);
    return false;
  }
  const tokensCssPath = path.join(outputDir, "src", "styles", "tokens.css");
  await fs.mkdir(path.dirname(tokensCssPath), { recursive: true });
  // Write only if not already from copyStyles step, else append
  if (await fileExists(tokensCssPath)) {
    const existing = await fs.readFile(tokensCssPath, "utf8");
    await fs.writeFile(
      tokensCssPath,
      existing + "\n/* Tokens (shared generator — preview ↔ live parity) */\n" + css,
      "utf8",
    );
  } else {
    await fs.writeFile(tokensCssPath, css, "utf8");
    tracked.push("src/styles/tokens.css");
  }
  return true;
}

/**
 * Extract font family name from CSS value like `'Bitter', serif` → `Bitter`.
 * Returns null if no quoted name found.
 */
function extractFontName(cssValue: string): string | null {
  const match = cssValue.match(/["']([^"']+)["']/);
  return match?.[1]?.replace(" Variable", "") ?? null;
}

/**
 * Rewrite Google Fonts `<link>` in `BaseLayout.astro` to use the theme's
 * default fonts from `packages/theme-<name>/theme.json` `defaults` block
 * (`--font-heading`, `--font-body`).
 *
 * WHY: theme-base/layouts/BaseLayout.astro hardcodes rose-theme fonts
 * (Comfortaa + Manrope). Without this step, every non-rose theme renders
 * with rose fonts on live sites whenever the merchant hasn't customised
 * fonts via themeSettings (scaffold-builder step 7b only fires on custom).
 *
 * This runs AFTER `copyBaseLayouts` (so the BaseLayout file is present)
 * and BEFORE scaffold-builder's step 7b (whose regex still matches and
 * overrides this on merchant-custom font selection).
 */
async function applyThemeDefaultFonts(
  themeDir: string,
  outputDir: string,
  warnings: string[],
): Promise<void> {
  const manifestPath = path.join(themeDir, "theme.json");
  const manifest = (await readJsonSafe(manifestPath)) as
    | { defaults?: Record<string, string> }
    | null;
  if (!manifest?.defaults) return;

  const headingCss = manifest.defaults["--font-heading"] ?? "";
  const bodyCss = manifest.defaults["--font-body"] ?? "";
  const headingName = extractFontName(headingCss);
  const bodyName = extractFontName(bodyCss);
  if (!headingName && !bodyName) return;

  const families = new Set<string>();
  if (headingName) families.add(headingName);
  if (bodyName) families.add(bodyName);
  const familyParams = [...families]
    .map((name) => `family=${name.replace(/ /g, "+")}:wght@100..900`)
    .join("&");
  const newUrl = `https://fonts.googleapis.com/css2?${familyParams}&display=swap`;

  const layoutPath = path.join(outputDir, "src", "layouts", "BaseLayout.astro");
  try {
    let layout = await fs.readFile(layoutPath, "utf8");
    const before = layout;
    layout = layout.replace(
      /href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]+"/,
      `href="${newUrl}"`,
    );
    if (layout === before) {
      warnings.push(
        `applyThemeDefaultFonts: no Google Fonts <link> match in BaseLayout.astro`,
      );
      return;
    }
    await fs.writeFile(layoutPath, layout, "utf8");
  } catch (e) {
    warnings.push(
      `applyThemeDefaultFonts: failed to patch BaseLayout.astro — ${(e as Error).message}`,
    );
  }
}

/**
 * Main entry point: assemble an Astro project from new-style packages.
 *
 * Flow:
 * 1. Base: copy layouts + seo + base blocks + styles from `packages/theme-base/`.
 * 2. Theme: copy theme-specific blocks + customBlocks + assets + styles from
 *    `packages/theme-<name>/`, OVERWRITING matching files from base.
 * 3. Tokens: generate tokens.css from `packages/theme-<name>/tokens.json`.
 *
 * Returns an AssembleResult describing the outcome for the caller (scaffold-builder)
 * which will proceed with its remaining steps (package.json, astro config, page
 * generation, tokens overrides, data.json, extra files).
 */
export async function assembleFromPackages(
  opts: AssembleOptions,
): Promise<AssembleResult> {
  const tracked: string[] = [];
  const warnings: string[] = [];

  const packagesRoot =
    opts.packagesRoot ?? path.join(process.cwd(), "packages");

  const baseDir = path.join(packagesRoot, "theme-base");
  const themeDir = path.join(packagesRoot, `theme-${opts.themeName}`);

  let baseCopied = false;
  let themeCopied = false;
  let tokensCssGenerated = false;

  await fs.mkdir(opts.outputDir, { recursive: true });

  // ---- LEGACY SCAFFOLD BRIDGE ----
  // Seed the output with the theme's legacy src/ (pages, auth/, react/
  // islands, data fixtures, scripts) and its curated package.json (holds
  // deps like @tanstack/react-query, glightbox that the generated minimal
  // one doesn't). The package overlays below then overwrite layouts,
  // blocks, styles, seo with the newer implementation.
  await copyLegacyScaffold(
    opts.themeName,
    opts.outputDir,
    tracked,
    warnings,
  );
  await copyLegacyPackageJson(
    opts.themeName,
    opts.outputDir,
    tracked,
    warnings,
  );

  // ---- BASE PASS ----
  if (await dirExists(baseDir)) {
    baseCopied = true;
    await copyBaseLayouts(packagesRoot, opts.outputDir, tracked, warnings);
    await copyBaseSeo(packagesRoot, opts.outputDir, tracked, warnings);
    await copyStyles(baseDir, opts.outputDir, tracked);
    // Copy all base blocks (do NOT overwrite — theme pass will)
    await copyBlocksFromPackage(baseDir, opts.outputDir, tracked, /* overwrite */ true);
  } else {
    warnings.push(`theme-base package not found at ${baseDir}`);
  }

  // ---- THEME PASS ----
  if (await dirExists(themeDir)) {
    themeCopied = true;
    // Theme blocks override base blocks of the same name
    await copyBlocksFromPackage(themeDir, opts.outputDir, tracked, /* overwrite */ true);
    await copyCustomBlocks(themeDir, opts.outputDir, tracked);
    await copyAssets(themeDir, opts.outputDir, tracked);
    await copyStyles(themeDir, opts.outputDir, tracked);
    // Rewrite Google Fonts <link> in BaseLayout to match theme.json defaults
    // (prevents all non-rose themes from inheriting rose's Comfortaa+Manrope)
    await applyThemeDefaultFonts(themeDir, opts.outputDir, warnings);
  } else {
    warnings.push(`theme-${opts.themeName} package not found at ${themeDir}`);
  }

  // ---- TOKENS ----
  if (themeCopied) {
    tokensCssGenerated = await generateTokensFromTheme(
      opts.themeName,
      opts.outputDir,
      tracked,
      warnings,
      opts.themeSettings,
    );
  }

  return {
    outputDir: opts.outputDir,
    generatedFiles: tracked,
    warnings,
    baseCopied,
    themeCopied,
    tokensCssGenerated,
  };
}

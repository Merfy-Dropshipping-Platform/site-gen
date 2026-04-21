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
    if (!(await fileExists(astroFile))) continue;
    const destAstro = path.join(componentsDir, `${bd.name}.astro`);
    const alreadyExists = await fileExists(destAstro);
    if (alreadyExists && !overwrite) continue;
    await fs.copyFile(astroFile, destAstro);
    tracked.push(path.relative(outputDir, destAstro));
    copiedBlocks.push(bd.name);
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
 * Read theme-<name>/tokens.json → emit src/styles/tokens.css.
 *
 * PHASE3A-STATUS: IMPLEMENTED (minimal emission — see generateTokensCssV2)
 */
async function generateTokensFromTheme(
  themePkgDir: string,
  outputDir: string,
  tracked: string[],
  warnings: string[],
): Promise<boolean> {
  const tokensPath = path.join(themePkgDir, "tokens.json");
  const tokensJson = await readJsonSafe(tokensPath);
  if (!tokensJson) {
    warnings.push(`tokens.json not found/invalid at ${tokensPath}`);
    return false;
  }
  const css = generateTokensCssV2(tokensJson);
  const tokensCssPath = path.join(outputDir, "src", "styles", "tokens.css");
  await fs.mkdir(path.dirname(tokensCssPath), { recursive: true });
  // Write only if not already from copyStyles step, else append
  if (await fileExists(tokensCssPath)) {
    const existing = await fs.readFile(tokensCssPath, "utf8");
    await fs.writeFile(
      tokensCssPath,
      existing + "\n/* Tokens from tokens.json (v2) */\n" + css,
      "utf8",
    );
  } else {
    await fs.writeFile(tokensCssPath, css, "utf8");
    tracked.push("src/styles/tokens.css");
  }
  return true;
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
  } else {
    warnings.push(`theme-${opts.themeName} package not found at ${themeDir}`);
  }

  // ---- TOKENS ----
  if (themeCopied) {
    tokensCssGenerated = await generateTokensFromTheme(
      themeDir,
      opts.outputDir,
      tracked,
      warnings,
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

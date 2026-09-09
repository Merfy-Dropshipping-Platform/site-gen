/**
 * Block source-root + flat-artifact-naming rules — extracted VERBATIM from
 * scripts/compile-astro-blocks.mjs so the compiler and the conformance source
 * snapshot share ONE source of truth instead of re-deriving the layout with
 * divergent string literals.
 *
 * Current behavior (pinned by scripts/__tests__/block-source-layout.test.mjs):
 *   - Only `theme-*` packages are scanned (`pkg.name.startsWith('theme-')`).
 *   - Theme-owned blocks live under `<pkg>/blocks/<BlockName>/`.
 *   - Compiled artifacts are FLAT: `<pkg>__<blockName>__<baseName>.mjs`.
 *   - The loader entrypoint is `<pkg>__<blockName>__index.mjs`.
 *
 * Plain ESM (no TS) so compile-astro-blocks.mjs — which runs under raw Node —
 * can import it without a transpile step.
 */

import path from 'node:path';

/** Canonical block-location directory names inside a theme package. */
export const BLOCK_LOCATIONS = Object.freeze(['blocks', 'customBlocks']);

/**
 * Only packages whose directory name starts with "theme-" are compiled
 * (theme-base, theme-rose, theme-bloom, …). Mirrors the compiler's
 * `pkg.name.startsWith('theme-')` guard.
 */
export function isThemePackage(pkgName) {
  return typeof pkgName === 'string' && pkgName.startsWith('theme-');
}

/**
 * Absolute path to a theme package's theme-owned block root:
 * `<sitesRoot>/packages/<pkg>/blocks`.
 */
export function blockSourceRoot(sitesRoot, pkgName) {
  return path.join(sitesRoot, 'packages', pkgName, 'blocks');
}

/**
 * Absolute path to a theme package's customBlocks root:
 * `<sitesRoot>/packages/<pkg>/customBlocks`. Distinct from `blocks/`.
 */
export function customBlockSourceRoot(sitesRoot, pkgName) {
  return path.join(sitesRoot, 'packages', pkgName, 'customBlocks');
}

/**
 * Flat compiled artifact name for a block file:
 * `<pkg>__<blockName>__<baseName>.mjs`. `baseName` is the file name WITHOUT its
 * `.astro`/`.ts` extension (use `blockArtifactBaseName`).
 */
export function flatArtifactName(pkg, blockName, baseName) {
  return `${pkg}__${blockName}__${baseName}.mjs`;
}

/**
 * The loader entrypoint artifact name: `<pkg>__<blockName>__index.mjs`.
 * The controller imports this to pick up a block's (or theme override's)
 * exports.
 */
export function flatIndexArtifactName(pkg, blockName) {
  return flatArtifactName(pkg, blockName, 'index');
}

/** Strip a block source file's `.astro` or `.ts` extension. */
export function blockArtifactBaseName(fileName) {
  return fileName.replace(/\.astro$/, '').replace(/\.ts$/, '');
}

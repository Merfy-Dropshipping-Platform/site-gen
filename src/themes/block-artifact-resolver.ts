/**
 * Controller path/package resolution — extracted from `createBlockLoader` in
 * `src/controllers/theme-puck-config.controller.ts` so the controller and the
 * conformance source snapshot share ONE resolution rule instead of re-deriving
 * it from comments or filename regexes.
 *
 * Current behavior (pinned by block-artifact-resolver.spec.ts):
 *   - Only a path starting with `./blocks/<Name>` AND a known themeId is
 *     theme-owned; it resolves to that theme package with blockName = last
 *     path segment.
 *   - Everything else resolves to `theme-base` with blockName = the raw
 *     path/name (matching the controller's `blockName = pathOrName` else
 *     branch).
 *   - The compiled artifact loaded is `<pkg>__<blockName>__index.mjs`.
 *
 * NOTE: the flat-artifact naming rule is owned by
 * `scripts/lib/block-source-layout.mjs` (`flatIndexArtifactName`). ts-jest
 * cannot import that plain-ESM helper, so the identical rule is mirrored here;
 * both sides assert the same literal (`theme-base__Hero__index.mjs`) in their
 * tests, so any drift breaks a test. Same mirror pattern the compiler uses for
 * `packages/theme-contract/registry/resolve.ts`.
 */

/**
 * themeId → package dir mapping for override lookups. Mirrors
 * `themePackageByThemeId` in the controller. Unknown ids fall through to base.
 */
export const THEME_PACKAGE_BY_THEME_ID: Readonly<Record<string, string>> = {
  rose: "theme-rose",
  vanilla: "theme-vanilla",
  bloom: "theme-bloom",
  satin: "theme-satin",
  flux: "theme-flux",
};

export interface BlockArtifactRef {
  /** Package the compiled artifact belongs to. */
  pkg: string;
  /** Block name used in the flat artifact identity. */
  blockName: string;
  /** Flat compiled loader artifact: `<pkg>__<blockName>__index.mjs`. */
  artifact: string;
}

/** Only `./blocks/<Name>` is treated as a theme-owned block artifact path. */
export function isThemeOwnedBlockPath(pathOrName: string): boolean {
  return typeof pathOrName === "string" && pathOrName.startsWith("./blocks/");
}

/**
 * Mirror of block-source-layout.mjs `flatIndexArtifactName`. Kept private so the
 * single public entry is `resolveBlockArtifact`.
 */
function flatIndexArtifactName(pkg: string, blockName: string): string {
  return `${pkg}__${blockName}__index.mjs`;
}

/**
 * Resolve `(themeId, pathOrName)` to the concrete compiled loader artifact,
 * exactly as `createBlockLoader` does before its `await import(absPath)`.
 */
export function resolveBlockArtifact(
  themeId: string,
  pathOrName: string,
): BlockArtifactRef {
  const themePackage = THEME_PACKAGE_BY_THEME_ID[themeId];
  let pkg: string;
  let blockName: string;
  if (isThemeOwnedBlockPath(pathOrName) && themePackage) {
    pkg = themePackage;
    blockName = pathOrName.split("/").pop() as string;
  } else {
    pkg = "theme-base";
    blockName = pathOrName;
  }
  return { pkg, blockName, artifact: flatIndexArtifactName(pkg, blockName) };
}

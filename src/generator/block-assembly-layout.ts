import path from "node:path";

/**
 * Assembler destination mapping — extracted from
 * `assemble-from-packages.ts` (`copyBlocksFromPackage` / `copyCustomBlocks`) so
 * the assembler and the conformance source snapshot agree on where each block
 * location lands. Conformance uses this to prove the generator `importPath`
 * matches the real assembler destination.
 *
 * Current behavior (pinned by block-assembly-layout.spec.ts):
 *   - `blocks/<X>/<X>.astro` is copied to `<outputDir>/src/components/<X>.astro`
 *   - `customBlocks/` is copied under `<outputDir>/src/customBlocks/`
 */

export type BlockLocation = "blocks" | "customBlocks";

/** Output subdir (relative to outputDir) for each block source location. */
export const BLOCK_ASSEMBLY_DESTINATIONS: Readonly<
  Record<BlockLocation, string>
> = {
  blocks: "src/components",
  customBlocks: "src/customBlocks",
};

/** Absolute destination dir for theme-owned `blocks/`: `<outputDir>/src/components`. */
export function blocksDestinationDir(outputDir: string): string {
  return path.join(outputDir, "src", "components");
}

/** Absolute destination dir for `customBlocks/`: `<outputDir>/src/customBlocks`. */
export function customBlocksDestinationDir(outputDir: string): string {
  return path.join(outputDir, "src", "customBlocks");
}

/**
 * Destination `.astro` path for a theme-owned block:
 * `blocks/<Name>/<Name>.astro` → `<outputDir>/src/components/<Name>.astro`.
 */
export function assembledBlockAstroPath(
  outputDir: string,
  blockName: string,
): string {
  return path.join(blocksDestinationDir(outputDir), `${blockName}.astro`);
}

/**
 * Destination path for an arbitrary component file name under
 * `src/components/` (companions etc.).
 */
export function assembledComponentPath(
  outputDir: string,
  fileName: string,
): string {
  return path.join(blocksDestinationDir(outputDir), fileName);
}

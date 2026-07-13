/**
 * Type declarations for the plain-ESM block-source-layout helper so TypeScript
 * consumers (conformance source snapshot) get types for the extracted rules.
 */

export declare const BLOCK_LOCATIONS: readonly ['blocks', 'customBlocks'];

export declare function isThemePackage(pkgName: string): boolean;

export declare function blockSourceRoot(
  sitesRoot: string,
  pkgName: string,
): string;

export declare function customBlockSourceRoot(
  sitesRoot: string,
  pkgName: string,
): string;

export declare function flatArtifactName(
  pkg: string,
  blockName: string,
  baseName: string,
): string;

export declare function flatIndexArtifactName(
  pkg: string,
  blockName: string,
): string;

export declare function blockArtifactBaseName(fileName: string): string;

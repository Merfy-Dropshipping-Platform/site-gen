import {
  THEME_PACKAGE_BY_THEME_ID,
  resolveBlockArtifact,
  isThemeOwnedBlockPath,
  type BlockArtifactRef,
} from '../block-artifact-resolver';

// Parity tests pinning the CURRENT controller path/package resolution
// (createBlockLoader in theme-puck-config.controller.ts). The controller must
// consume these helpers with no behavior change; conformance then asks the same
// helper whether a canonical block is reachable — never inferring from comments
// or filename regexes.

describe('block-artifact-resolver (controller path/package resolution parity)', () => {
  it('maps each wired themeId to its package dir', () => {
    expect(THEME_PACKAGE_BY_THEME_ID).toEqual({
      rose: 'theme-rose',
      vanilla: 'theme-vanilla',
      bloom: 'theme-bloom',
      satin: 'theme-satin',
      flux: 'theme-flux',
    });
  });

  it('isThemeOwnedBlockPath: only "./blocks/<Name>" counts as theme-owned', () => {
    expect(isThemeOwnedBlockPath('./blocks/Header')).toBe(true);
    expect(isThemeOwnedBlockPath('./blocks/Footer')).toBe(true);
    // Bare block name = base convention, NOT theme-owned.
    expect(isThemeOwnedBlockPath('Header')).toBe(false);
    // customBlocks is NOT a theme-owned block artifact path today.
    expect(isThemeOwnedBlockPath('./customBlocks/Benefits')).toBe(false);
    expect(isThemeOwnedBlockPath('')).toBe(false);
  });

  it('theme override path "./blocks/Header" resolves to the theme package', () => {
    const ref = resolveBlockArtifact('satin', './blocks/Header');
    expect(ref).toEqual<BlockArtifactRef>({
      pkg: 'theme-satin',
      blockName: 'Header',
      artifact: 'theme-satin__Header__index.mjs',
    });
  });

  it('bare block name resolves to theme-base (base convention)', () => {
    const ref = resolveBlockArtifact('rose', 'Hero');
    expect(ref).toEqual<BlockArtifactRef>({
      pkg: 'theme-base',
      blockName: 'Hero',
      artifact: 'theme-base__Hero__index.mjs',
    });
  });

  it('theme override path with UNKNOWN themeId falls back to theme-base', () => {
    // createBlockLoader: `pathOrName.startsWith('./blocks/') && themePackage`.
    // No themePackage for unknown id → base branch, blockName = pathOrName as-is.
    const ref = resolveBlockArtifact('legacy-unknown', './blocks/Header');
    expect(ref.pkg).toBe('theme-base');
    // Base branch uses the FULL pathOrName as blockName (matching the
    // controller's `blockName = pathOrName` in the else branch).
    expect(ref.blockName).toBe('./blocks/Header');
    expect(ref.artifact).toBe('theme-base__./blocks/Header__index.mjs');
  });

  it('canonical customBlocks path is NOT reachable as a theme-owned artifact', () => {
    // The conformance snapshot asks this helper whether canonical
    // ./customBlocks/Benefits is reachable. Today it is NOT theme-owned, so it
    // falls through to the base branch (F-040 location defect).
    expect(isThemeOwnedBlockPath('./customBlocks/Benefits')).toBe(false);
    const ref = resolveBlockArtifact('bloom', './customBlocks/Benefits');
    expect(ref.pkg).toBe('theme-base');
  });

  it('theme override blockName is the trailing path segment', () => {
    const ref = resolveBlockArtifact('flux', './blocks/Footer');
    expect(ref.blockName).toBe('Footer');
    expect(ref.pkg).toBe('theme-flux');
  });
});

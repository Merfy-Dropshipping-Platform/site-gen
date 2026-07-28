import fs from 'node:fs';
import path from 'node:path';
import { resolveBlocks, type BaseBlockEntry } from '../../theme-contract/resolver/resolveBlocks';

/**
 * Task 9 (111-flux-layout-parity, Step 2): replaces the stale
 * `header-block-contract.test.ts`, which tested a package-level Header
 * override (`packages/theme-flux/blocks/Header/`) that was never complete
 * (no `Header.astro`) and conflicted with the V2 architecture — the
 * constructor's config loader could pick that incomplete schema instead of
 * @merfy/theme-base's real one. That directory has been deleted and
 * `theme.json`'s `blocks.Header.override` declaration removed.
 *
 * Flux's actual visual Header renderer lives at
 * `themes/flux/src/components/Header.astro` and is wired independently via
 * `themes/flux/sections.map.json` (the V2 render pipeline) — it does not
 * need, and must not require, a theme.json blocks/override entry to work.
 * That mapping is covered by `scripts/__tests__/flux-home-contract.test.mjs`
 * and `theme-manifest.test.ts`'s "V2 renderer" assertion, not here.
 */
describe('Flux Header (post-cleanup: no package override)', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '..', 'theme.json'), 'utf-8'),
  );

  const BASE_BLOCKS: Record<string, BaseBlockEntry> = {
    Header: { source: 'base', path: '@merfy/theme-base/blocks/Header' },
  };

  it('Header Puck config resolves from @merfy/theme-base, not a Flux package override', () => {
    const resolved = resolveBlocks(BASE_BLOCKS, {
      blocks: manifest.blocks ?? {},
      features: manifest.features ?? {},
      customBlocks: manifest.customBlocks ?? {},
    });
    expect(resolved.Header.source).toBe('base');
    expect(resolved.Header.path).toBe('@merfy/theme-base/blocks/Header');
  });

  it('theme.json declares no blocks.Header.override', () => {
    expect(manifest.blocks.Header?.override).toBeUndefined();
  });

  it('packages/theme-flux/blocks/Header no longer exists on disk', () => {
    expect(fs.existsSync(path.resolve(__dirname, '..', 'blocks', 'Header'))).toBe(false);
  });

  it('Flux blockDefaults.Header layers Flux-specific defaults on top of theme-base (variant + promoBar)', () => {
    const headerDefaults = manifest.blockDefaults?.Header;
    expect(headerDefaults).toBeDefined();
    expect(headerDefaults.variant).toBe('two-tier');
    expect(headerDefaults.promoBar).toBeDefined();
    expect(headerDefaults.promoBar.enabled).toBe(true);
    expect(typeof headerDefaults.promoBar.text).toBe('string');
    expect(headerDefaults.promoBar.text.length).toBeGreaterThan(0);
  });
});

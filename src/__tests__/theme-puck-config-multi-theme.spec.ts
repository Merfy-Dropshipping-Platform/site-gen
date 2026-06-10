/**
 * Multi-theme resolver wiring test (Phase 2a).
 *
 * Validates that the puck-config controller logic correctly resolves
 * Header/Footer overrides for both 'rose' and 'vanilla' themes, and that
 * unknown themeIds fall back to base.
 *
 * This test mirrors the controller's own `getThemeManifest` + `createBlockLoader`
 * wiring without spinning up the full Nest context — it reads the theme.json
 * files directly and exercises `resolveBlocks` from @merfy/theme-contract.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  resolveBlocks,
  type BaseBlockEntry,
  type ThemeConfigForResolver,
} from '../../packages/theme-contract/resolver/resolveBlocks';

const ROOT = resolve(__dirname, '..', '..');

function loadManifest(theme: 'rose' | 'vanilla' | 'bloom' | 'satin' | 'flux'): ThemeConfigForResolver {
  const raw = readFileSync(resolve(ROOT, 'packages', `theme-${theme}`, 'theme.json'), 'utf-8');
  const json = JSON.parse(raw);
  return {
    blocks: json.blocks ?? {},
    features: json.features ?? {},
    customBlocks: json.customBlocks ?? {},
  };
}

const BASE_BLOCKS: Record<string, BaseBlockEntry> = Object.fromEntries(
  ['Hero', 'Header', 'Footer', 'AuthModal'].map(
    (name) => [name, { source: 'base' as const, path: name }],
  ),
);

describe('Theme manifest resolver (Phase 2a multi-theme wiring)', () => {
  it('vanilla manifest inherits Header + Footer from base (spec 084 — no overrides)', () => {
    // Spec 084 §2.2 — vanilla отказался от override-блоков. Header/Footer
    // резолвятся в `packages/theme-base/blocks/<X>` через universal variants
    // (Header.logoPosition='center-absolute', Footer.variant='2-part-asymmetric')
    // конфигурируемых через theme.json blockDefaults.
    const vanilla = loadManifest('vanilla');
    const resolved = resolveBlocks(BASE_BLOCKS, vanilla);

    expect(resolved.Header.source).toBe('base');
    expect(resolved.Footer.source).toBe('base');
    expect(resolved.Hero.source).toBe('base');
    expect(resolved.AuthModal.source).toBe('base');
  });

  it('rose manifest inherits Header + Footer from base (overrides removed)', () => {
    // Rose Header + Footer overrides removed — defaults moved to
    // theme.json blockDefaults.Header (siteTitle='Rose Theme', navigationLinks)
    // и blockDefaults.Footer (variant='3-col', newsletter с rose-текстами,
    // columns, socialColumn, copyright, padding).
    // ThemePuckConfigController мержит blockDefaults поверх base puckConfig defaults.
    const rose = loadManifest('rose');
    const resolved = resolveBlocks(BASE_BLOCKS, rose);

    expect(resolved.Header.source).toBe('base');
    expect(resolved.Footer.source).toBe('base');
  });

  it('vanilla manifest has distinct signature from rose', () => {
    const vanilla = JSON.parse(readFileSync(resolve(ROOT, 'packages', 'theme-vanilla', 'theme.json'), 'utf-8'));
    const rose = JSON.parse(readFileSync(resolve(ROOT, 'packages', 'theme-rose', 'theme.json'), 'utf-8'));

    expect(vanilla.id).toBe('vanilla');
    expect(rose.id).toBe('rose');
    expect(vanilla.defaults['--container-max-width']).toBe('1320px');
    // Фаза 3 defaults-сверка под верстальщика: внешняя обёртка rose 1920px
    // (Header/Footer max-w-[1920px]), CTA радиус 6px (MANNER.md §3).
    expect(rose.defaults['--container-max-width']).toBe('1920px');
    expect(vanilla.defaults['--radius-button']).toBe('0px');
    expect(rose.defaults['--radius-button']).toBe('6px');
  });

  it('bloom manifest inherits Header + Footer from base (spec 089 — no overrides)', () => {
    // Spec 089 Bundle 3 — bloom отказался от override-блоков. Header/Footer/
    // Catalog/Hero резолвятся в `packages/theme-base/blocks/<X>` через
    // theme.json blockDefaults + Hero `split-bloom` additive variant.
    const bloom = loadManifest('bloom');
    const resolved = resolveBlocks(BASE_BLOCKS, bloom);

    expect(resolved.Header.source).toBe('base');
    expect(resolved.Footer.source).toBe('base');
    expect(resolved.Hero.source).toBe('base');
    expect(resolved.AuthModal.source).toBe('base');

    const bloomJson = JSON.parse(readFileSync(resolve(ROOT, 'packages', 'theme-bloom', 'theme.json'), 'utf-8'));
    expect(bloomJson.id).toBe('bloom');
    expect(bloomJson.defaults['--container-max-width']).toBe('1320px');
    expect(bloomJson.defaults['--radius-button']).toBe('100px');
    expect(bloomJson.defaults['--radius-card']).toBe('12px');
    expect(bloomJson.blockDefaults.Hero.variant).toBe('split-bloom');
  });

  it('satin manifest overrides Header + Footer with monochrome + flat (0px) radii signature', () => {
    const satin = loadManifest('satin');
    const resolved = resolveBlocks(BASE_BLOCKS, satin);

    expect(resolved.Header.source).toBe('theme');
    expect(resolved.Header.path).toBe('./blocks/Header');
    expect(resolved.Footer.source).toBe('theme');
    expect(resolved.Footer.path).toBe('./blocks/Footer');

    const satinJson = JSON.parse(readFileSync(resolve(ROOT, 'packages', 'theme-satin', 'theme.json'), 'utf-8'));
    expect(satinJson.id).toBe('satin');
    expect(satinJson.defaults['--container-max-width']).toBe('1320px');
    expect(satinJson.defaults['--radius-button']).toBe('0px');
    expect(satinJson.defaults['--radius-card']).toBe('0px');
  });

  it('flux manifest overrides Header only (Footer override удалён в cleanup)', () => {
    const flux = loadManifest('flux');
    const resolved = resolveBlocks(BASE_BLOCKS, flux);

    expect(resolved.Header.source).toBe('theme');
    expect(resolved.Header.path).toBe('./blocks/Header');
    expect(resolved.Footer.source).toBe('base');

    const fluxJson = JSON.parse(readFileSync(resolve(ROOT, 'packages', 'theme-flux', 'theme.json'), 'utf-8'));
    expect(fluxJson.id).toBe('flux');
    expect(fluxJson.defaults['--container-max-width']).toBe('1320px');
    expect(fluxJson.defaults['--radius-button']).toBe('6px');
    expect(fluxJson.defaults['--radius-card']).toBe('12px');
    // Orange accent signature
    expect(fluxJson.colorSchemes[0].tokens['--color-accent']).toBe('250 81 9');
  });

  it('themes resolve Header + Footer correctly (satin/flux override Header+Footer; rose/vanilla/bloom base)', () => {
    // After spec 084 — vanilla больше не override Header/Footer.
    // After spec 089 Bundle 3 — bloom тоже отказался от override-блоков.
    // After rose Header + Footer migration — rose теперь полностью base
    // (defaults в theme.json blockDefaults.Header и blockDefaults.Footer).
    // satin держит Header+Footer overrides; flux — только Header
    // (Footer удалён в puckConfig overrides cleanup).
    {
      const satin = resolveBlocks(BASE_BLOCKS, loadManifest('satin'));
      expect(satin.Header.source).toBe('theme');
      expect(satin.Footer.source).toBe('theme');
      expect(satin.AuthModal.source).toBe('base');
      const flux = resolveBlocks(BASE_BLOCKS, loadManifest('flux'));
      expect(flux.Header.source).toBe('theme');
      expect(flux.Footer.source).toBe('base');
      expect(flux.Hero.source).toBe('base');
      expect(flux.AuthModal.source).toBe('base');
    }

    // Rose, Vanilla, Bloom: no Header/Footer overrides, all from base
    for (const id of ['rose', 'vanilla', 'bloom'] as const) {
      const manifest = loadManifest(id);
      const resolved = resolveBlocks(BASE_BLOCKS, manifest);
      expect(resolved.Header.source).toBe('base');
      expect(resolved.Footer.source).toBe('base');
      expect(resolved.Hero.source).toBe('base');
      expect(resolved.AuthModal.source).toBe('base');
    }
  });
});

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

  it('rose manifest overrides Header + Footer (regression check)', () => {
    const rose = loadManifest('rose');
    const resolved = resolveBlocks(BASE_BLOCKS, rose);

    expect(resolved.Header.source).toBe('theme');
    expect(resolved.Footer.source).toBe('theme');
  });

  it('vanilla manifest has distinct signature from rose', () => {
    const vanilla = JSON.parse(readFileSync(resolve(ROOT, 'packages', 'theme-vanilla', 'theme.json'), 'utf-8'));
    const rose = JSON.parse(readFileSync(resolve(ROOT, 'packages', 'theme-rose', 'theme.json'), 'utf-8'));

    expect(vanilla.id).toBe('vanilla');
    expect(rose.id).toBe('rose');
    expect(vanilla.defaults['--container-max-width']).toBe('1320px');
    expect(rose.defaults['--container-max-width']).toBe('1280px');
    expect(vanilla.defaults['--radius-button']).toBe('0px');
    expect(rose.defaults['--radius-button']).toBe('8px');
  });

  it('bloom manifest overrides Header + Footer with pill-radius + pink palette signature', () => {
    const bloom = loadManifest('bloom');
    const resolved = resolveBlocks(BASE_BLOCKS, bloom);

    expect(resolved.Header.source).toBe('theme');
    expect(resolved.Header.path).toBe('./blocks/Header');
    expect(resolved.Footer.source).toBe('theme');
    expect(resolved.Footer.path).toBe('./blocks/Footer');

    const bloomJson = JSON.parse(readFileSync(resolve(ROOT, 'packages', 'theme-bloom', 'theme.json'), 'utf-8'));
    expect(bloomJson.id).toBe('bloom');
    expect(bloomJson.defaults['--container-max-width']).toBe('1320px');
    expect(bloomJson.defaults['--radius-button']).toBe('100px');
    expect(bloomJson.defaults['--radius-card']).toBe('12px');
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

  it('flux manifest overrides Header + Footer with dark + orange accent signature', () => {
    const flux = loadManifest('flux');
    const resolved = resolveBlocks(BASE_BLOCKS, flux);

    expect(resolved.Header.source).toBe('theme');
    expect(resolved.Header.path).toBe('./blocks/Header');
    expect(resolved.Footer.source).toBe('theme');
    expect(resolved.Footer.path).toBe('./blocks/Footer');

    const fluxJson = JSON.parse(readFileSync(resolve(ROOT, 'packages', 'theme-flux', 'theme.json'), 'utf-8'));
    expect(fluxJson.id).toBe('flux');
    expect(fluxJson.defaults['--container-max-width']).toBe('1320px');
    expect(fluxJson.defaults['--radius-button']).toBe('6px');
    expect(fluxJson.defaults['--radius-card']).toBe('12px');
    // Orange accent signature
    expect(fluxJson.colorSchemes[0].tokens['--color-accent']).toBe('250 81 9');
  });

  it('themes resolve Header + Footer correctly (rose/bloom/satin/flux override; vanilla base)', () => {
    // After spec 084 — vanilla больше не override Header/Footer; остальные
    // 4 темы пока используют override (миграция на base — отдельная spec).
    const overrideThemes: Array<'rose' | 'bloom' | 'satin' | 'flux'> = ['rose', 'bloom', 'satin', 'flux'];
    for (const id of overrideThemes) {
      const manifest = loadManifest(id);
      const resolved = resolveBlocks(BASE_BLOCKS, manifest);
      expect(resolved.Header.source).toBe('theme');
      expect(resolved.Footer.source).toBe('theme');
      expect(resolved.Hero.source).toBe('base');
      expect(resolved.AuthModal.source).toBe('base');
    }

    // Vanilla: no overrides, all from base
    const vanilla = loadManifest('vanilla');
    const vanillaResolved = resolveBlocks(BASE_BLOCKS, vanilla);
    expect(vanillaResolved.Header.source).toBe('base');
    expect(vanillaResolved.Footer.source).toBe('base');
  });
});

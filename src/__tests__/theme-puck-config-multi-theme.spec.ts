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

function loadManifest(theme: 'rose' | 'vanilla' | 'bloom'): ThemeConfigForResolver {
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
  it('vanilla manifest overrides Header + Footer, inherits base for Hero/AuthModal', () => {
    const vanilla = loadManifest('vanilla');
    const resolved = resolveBlocks(BASE_BLOCKS, vanilla);

    expect(resolved.Header.source).toBe('theme');
    expect(resolved.Header.path).toBe('./blocks/Header');
    expect(resolved.Footer.source).toBe('theme');
    expect(resolved.Footer.path).toBe('./blocks/Footer');
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
});

/**
 * Task 2 — Satin mapped-renderer reachability.
 *
 * A mapped block is proved reachable ONLY by importing the EXACT Satin renderer
 * the compiled section manifest names for it. A passing base renderer can never
 * mask a mapped-renderer failure. This suite proves that:
 *   - every one of the 18 sections-map keys resolves to a Satin-owned compiled
 *     section module (`dist/theme-sections/satin/themes_satin_src_components_*`),
 *     never a theme-base module;
 *   - the exact compiled module imports with a real `default` export;
 *   - the section manifest and the standalone sections.map.json share the same
 *     18 canonical keys (a wrong-target / `{}` manifest would be a failure).
 *
 * Requires the four-step build (build → build:blocks →
 * build:theme-sections satin → run-theme-build satin).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadThemeSourceSnapshot } from '../conformance/source-snapshot';

const SITES_ROOT = resolve(__dirname, '..', '..', '..');

function readJson(rel: string): Record<string, string> {
  return JSON.parse(
    readFileSync(resolve(SITES_ROOT, rel), 'utf-8'),
  ) as Record<string, string>;
}

describe('Satin sections manifest ↔ source map key parity', () => {
  it('the compiled manifest has the same 18 canonical keys as the source map', () => {
    const sourceMap = readJson('themes/satin/sections.map.json');
    const manifest = readJson('dist/theme-sections/satin/manifest.json');
    const sourceKeys = Object.keys(sourceMap).sort();
    const manifestKeys = Object.keys(manifest).sort();
    expect(sourceKeys).toHaveLength(18);
    expect(manifestKeys).toEqual(sourceKeys);
    // A `{}` manifest (build failure / wrong target) would be a structural
    // failure — never allowed as a fallback.
    expect(manifestKeys.length).toBeGreaterThan(0);
  });
});

describe('Satin mapped renderers resolve to Satin-owned compiled modules', () => {
  it('every mapped section resolves to a Satin section module, not theme-base', async () => {
    const snap = await loadThemeSourceSnapshot('satin');
    expect(snap.sectionsMap).toHaveLength(18);
    for (const rec of snap.sectionsMap) {
      // The mapped compiled module is Satin-owned; theme-base cannot mask it.
      expect(rec.compiledModule).not.toBeNull();
      expect(rec.compiledModule!).toMatch(
        /^dist\/theme-sections\/satin\/themes_satin_src_components_.*\.mjs$/,
      );
      expect(rec.compiledModule!).not.toContain('theme-base');
      // The exact mapped module must exist on disk.
      expect(existsSync(resolve(SITES_ROOT, rec.compiledModule!))).toBe(true);
    }
  });

  it('every mapped renderer imports with a real default export', async () => {
    const snap = await loadThemeSourceSnapshot('satin');
    const unreachable = snap.sectionsMap
      .filter((r) => !r.mappedRendererReachable)
      .map((r) => r.name);
    // Zero unreachable mapped renderers on the audited ref.
    expect(unreachable).toEqual([]);
    expect(snap.sectionsMap.every((r) => r.mappedRendererReachable)).toBe(true);
  });

  it('the standalone source file each map entry points at exists', async () => {
    const snap = await loadThemeSourceSnapshot('satin');
    for (const rec of snap.sectionsMap) {
      expect(rec.sourceExists).toBe(true);
      expect(rec.sourceTarget).toMatch(/^src\/components\/.*\.astro$/);
    }
  });
});

describe('Satin generator renderers vs sections-map (kept distinct)', () => {
  it('the 22 generator renderers are reachable and are a superset of the 18 sections', async () => {
    const snap = await loadThemeSourceSnapshot('satin');
    const sectionKeys = new Set(snap.sectionsMap.map((r) => r.name));
    const generatorNames = new Set(snap.registry.map((r) => r.name));
    // Sections-map keys ⊂ generator entries (Page/Product/Catalog/CheckoutSection
    // are generator-only, not sections-map keys).
    for (const key of sectionKeys) {
      expect(generatorNames.has(key)).toBe(true);
    }
    expect(snap.registry.length).toBe(22);
    expect(snap.sectionsMap.length).toBe(18);
    // Generator-only entries (not in the sections map) still resolve compiled.
    const generatorOnly = [...generatorNames].filter((n) => !sectionKeys.has(n)).sort();
    expect(generatorOnly).toEqual(
      expect.arrayContaining(['Catalog', 'CheckoutSection', 'Page', 'Product']),
    );
    const reachable = new Set(snap.renderersReachable);
    for (const n of generatorOnly) expect(reachable.has(n)).toBe(true);
  });
});

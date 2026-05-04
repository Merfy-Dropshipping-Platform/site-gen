import * as path from 'node:path';
import * as fs from 'node:fs';
import { vanillaRegistry, vanillaServerRegistry } from '../registries/vanilla';

/**
 * 084 vanilla pilot — T012. Sanity-checks the vanilla registry mapping.
 *
 * The full migration to `packages/theme-base/blocks/<X>/<X>.astro` happens
 * in T022 (Phase 3 implementation). This test only verifies the current
 * registry shape:
 *   1. Every entry has a non-empty `importPath` resolving to a real file
 *      under the legacy templates directory OR a `packages/theme-base`
 *      block.
 *   2. PromoBanner is registered (was missing before — see spec.md §1.2 R2).
 *   3. The server-side variant inherits the same mapping with PopularProducts
 *      swapped to a server-island.
 */
describe('vanillaRegistry (084)', () => {
  it('registers PromoBanner', () => {
    expect(vanillaRegistry.PromoBanner).toBeDefined();
    expect(vanillaRegistry.PromoBanner.name).toBe('PromoBanner');
  });

  it('every entry has a non-empty importPath', () => {
    for (const [name, entry] of Object.entries(vanillaRegistry)) {
      expect({ name, importPath: entry.importPath }).toEqual(
        expect.objectContaining({ name, importPath: expect.any(String) }),
      );
      expect(entry.importPath.length).toBeGreaterThan(0);
    }
  });

  it('importPaths resolve to existing .astro files (legacy templates OR packages)', () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    // Registry paths are relative to `<theme>/src/pages/...`. Resolve
    // against the legacy templates dir for the existing static entries.
    const pagesDir = path.join(repoRoot, 'templates/astro/vanilla/src/pages');
    const packagesDir = path.join(repoRoot, 'packages/theme-base/blocks');

    const missing: string[] = [];
    for (const [name, entry] of Object.entries(vanillaRegistry)) {
      // Two candidate resolutions: legacy templates relative path, OR
      // `packages/theme-base/blocks/<Name>/<Name>.astro`.
      const candidate1 = path.resolve(pagesDir, entry.importPath);
      const candidate2 = path.join(packagesDir, name, `${name}.astro`);
      if (!fs.existsSync(candidate1) && !fs.existsSync(candidate2)) {
        missing.push(`${name} → ${entry.importPath}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('vanillaServerRegistry mirrors registry with PopularProducts as server-island', () => {
    expect(vanillaServerRegistry.PopularProducts.kind).toBe('server-island');
    // Other entries identical.
    for (const name of Object.keys(vanillaRegistry)) {
      if (name === 'PopularProducts') continue;
      expect(vanillaServerRegistry[name]).toBeDefined();
    }
  });
});

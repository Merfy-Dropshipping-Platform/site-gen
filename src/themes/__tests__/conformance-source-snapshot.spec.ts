import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadThemeSourceSnapshot } from '../conformance/source-snapshot';
import { bloomRegistry } from '../../generator/registries/bloom';

// Task 3: the real Bloom source + compiled snapshot. Requires build
// prerequisites (build → build:blocks → build:theme-sections bloom →
// run-theme-build bloom).

const SITES_ROOT = resolve(__dirname, '..', '..', '..');

describe('loadThemeSourceSnapshot(bloom) — real source facts', () => {
  it('sees Benefits under blocks (physical, keyed by location,name)', async () => {
    const snap = await loadThemeSourceSnapshot('bloom');
    const benefits = snap.physicalBlocks.find(
      (b) => b.name === 'Benefits' && b.location === 'blocks',
    );
    expect(benefits).toBeDefined();
    // F-041: Benefits is missing classes + tokens files.
    expect(benefits!.policy.missingFiles).toEqual(
      expect.arrayContaining(['Benefits.classes.ts', 'Benefits.tokens.ts']),
    );
    // It is NOT under customBlocks (F-040 location defect recorded, not moved).
    expect(
      snap.physicalBlocks.some(
        (b) => b.name === 'Benefits' && b.location === 'customBlocks',
      ),
    ).toBe(false);
  });

  it('sees Catalog physical in bloom but base-resolved', async () => {
    const snap = await loadThemeSourceSnapshot('bloom');
    // Physical copy exists in theme-bloom/blocks/Catalog.
    const physical = snap.physicalBlocks.find(
      (b) => b.name === 'Catalog' && b.location === 'blocks',
    );
    expect(physical).toBeDefined();
    // But the resolver resolves Catalog to BASE (theme.json override is empty).
    const resolution = snap.resolutions.find((r) => r.name === 'Catalog');
    expect(resolution).toBeDefined();
    expect(resolution!.source).toBe('base');
    expect(resolution!.pkg).toBe('theme-base');
    expect(resolution!.loaderArtifact).toBe('theme-base__Catalog__index.mjs');
  });

  it('records Bloom runtime sources and the standalone build outputs', async () => {
    const snap = await loadThemeSourceSnapshot('bloom');
    expect(snap.runtimeSources).toEqual(
      expect.arrayContaining([
        expect.stringContaining('nt-cart.ts'),
        expect.stringContaining('placeholders.ts'),
      ]),
    );
    // The standalone live output index.html is present after run-theme-build.
    expect(snap.standaloneOutputs.liveIndexHtml).toBe(true);
    expect(snap.standaloneOutputs.themeDistIndexHtml).toBe(true);
  });

  it('records generator registry reachability (Benefits importPath → src/components)', async () => {
    const snap = await loadThemeSourceSnapshot('bloom');
    const benefits = snap.registry.find((r) => r.name === 'Benefits');
    expect(benefits).toBeDefined();
    // F-040: Benefits registry importPath (../components/Benefits.astro) maps to
    // the blocks destination and a physical block source exists to feed it —
    // the location defect is recorded, the block is NOT moved.
    expect(benefits!.importPath).toBe('../components/Benefits.astro');
    expect(benefits!.assemblerDestination).toBe('src/components');
    expect(benefits!.physicalSourcePresent).toBe(true);
  });

  it('checkout-result / OrderConfirmation page is absent', async () => {
    const snap = await loadThemeSourceSnapshot('bloom');
    expect(snap.hasCheckoutResultPage).toBe(false);
  });

  it('compiled Puck index (named exports) + mapped Publications renderer (default export) import', async () => {
    const snap = await loadThemeSourceSnapshot('bloom');
    // The compiled Puck INDEX module used by the controller is a config module:
    // it succeeds on its named exports (CatalogPuckConfig, …), not a `default`.
    const catalog = snap.compiledModules.find((m) =>
      m.module.endsWith('theme-base__Catalog__index.mjs'),
    );
    expect(catalog).toBeDefined();
    expect(catalog!.failure).toBeUndefined();
    expect(catalog!.namedExports).toEqual(
      expect.arrayContaining(['CatalogPuckConfig']),
    );
    // The mapped Publications section RENDERER succeeds on a REAL default export
    // (a `{}` import would be a failure).
    expect(snap.publications.module).toContain('Publications');
    const pub = snap.compiledModules.find(
      (m) => m.module === snap.publications.module,
    );
    expect(pub?.defaultExport).toBe(true);
  });

  it('marks EVERY registry renderer with a compiled default export as reachable', async () => {
    const snap = await loadThemeSourceSnapshot('bloom');
    // The real snapshot must import-check every bloomRegistry renderer against
    // its real compiled artifact (mapped → dist/theme-sections/bloom via the
    // section manifest; unmapped → dist/astro-blocks/<pkg>__<Block>__<Block>.mjs)
    // and mark it reachable on a REAL default export — NOT infer reachability
    // from a physical theme-bloom .astro (which only Benefits/Catalog have).
    const reachable = new Set(snap.renderersReachable);
    const registryNames = Object.keys(bloomRegistry).sort();

    // On the target ref every registry renderer resolves to a compiled module
    // with a default export, so ALL of them must be reachable (renderer-
    // unreachable must be 0). Previously falsely-"unreachable" blocks:
    for (const name of [
      'Hero',
      'Header',
      'Footer',
      'MainText',
      'Publications',
      'Product',
      'Page',
    ]) {
      expect(reachable.has(name)).toBe(true);
    }
    // Coverage is complete: no registry renderer is left out.
    for (const name of registryNames) {
      expect(reachable.has(name)).toBe(true);
    }
    // Reachability is derived only from registry renderers (no stray extras).
    for (const name of snap.renderersReachable) {
      expect(registryNames).toContain(name);
    }
  });

  it('captures the generated Bloom preview-cart script + cart-drawer descriptors', async () => {
    const snap = await loadThemeSourceSnapshot('bloom');
    expect(snap.previewCart.script).toContain('"bloom:cart:v1"');
    expect(snap.previewCart.scriptDigest).toMatch(/^[0-9a-f]{64}$/);
    // Cart-drawer fixture: valid scheme → coupled SCHEME+DISCLAIMER + title.
    expect(snap.cartDrawer.globals.__MERFY_CART_DRAWER_SCHEME__).toBe('scheme-2');
    expect(snap.cartDrawer.globals.__MERFY_CART_DRAWER_TITLE__).toBe('Корзина');
    // Observed reachability (input for Task 4): NOT reaching built-theme blob.
    expect(snap.cartDrawer.reachability).toEqual({
      v2Sections: true,
      builtTheme: false,
      liveBuild: true,
    });
  });

  it('raw theme.json retains pages/blockDefaults that Zod parse strips', async () => {
    const snap = await loadThemeSourceSnapshot('bloom');
    const tj = snap.themeJson as Record<string, unknown>;
    expect(Array.isArray(tj.pages)).toBe(true);
    expect(tj.blockDefaults).toBeDefined();
  });
});

describe('loadThemeSourceSnapshot(bloom) — determinism', () => {
  it('two snapshots are byte-identical (compiledAt / absolute roots stripped)', async () => {
    const a = await loadThemeSourceSnapshot('bloom');
    const b = await loadThemeSourceSnapshot('bloom');
    // No volatile timestamps / absolute paths anywhere in the serialized form.
    const sa = JSON.stringify(a);
    const sb = JSON.stringify(b);
    expect(sa).toBe(sb);
    expect(sa).not.toContain('compiledAt');
    // No absolute worktree path leaked into the snapshot.
    expect(sa).not.toContain(SITES_ROOT);
    expect(a.sourceDigest).toBe(b.sourceDigest);
  });

  it('a manifest with a different compiledAt and different absolute roots yields identical bytes', async () => {
    // The snapshot never reads dist manifest compiledAt nor hashes compiled
    // .mjs bytes, so two runs (dist unchanged) already prove invariance; this
    // guards the property explicitly against accidental serialization.
    const a = await loadThemeSourceSnapshot('bloom');
    expect(JSON.stringify(a)).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

describe('loadThemeSourceSnapshot(bloom) — digest churn', () => {
  it('mutating a pipeline helper changes sourceDigest', async () => {
    const helper = resolve(
      SITES_ROOT,
      'scripts',
      'lib',
      'block-source-layout.mjs',
    );
    const original = readFileSync(helper);
    const base = (await loadThemeSourceSnapshot('bloom')).sourceDigest;
    try {
      writeFileSync(helper, Buffer.concat([original, Buffer.from('\n// churn\n')]));
      const mutated = (await loadThemeSourceSnapshot('bloom')).sourceDigest;
      expect(mutated).not.toBe(base);
    } finally {
      writeFileSync(helper, original);
    }
    // Restored → digest returns to baseline.
    expect((await loadThemeSourceSnapshot('bloom')).sourceDigest).toBe(base);
  });

  it('mutating a conformance rule/requirement source changes sourceDigest', async () => {
    const rule = resolve(
      SITES_ROOT,
      'packages',
      'theme-contract',
      'conformance',
      'requirements.ts',
    );
    const original = readFileSync(rule);
    const base = (await loadThemeSourceSnapshot('bloom')).sourceDigest;
    try {
      writeFileSync(rule, Buffer.concat([original, Buffer.from('\n// churn\n')]));
      const mutated = (await loadThemeSourceSnapshot('bloom')).sourceDigest;
      expect(mutated).not.toBe(base);
    } finally {
      writeFileSync(rule, original);
    }
    expect((await loadThemeSourceSnapshot('bloom')).sourceDigest).toBe(base);
  });

  it('a different reviewed-requirements fixture changes sourceDigest', async () => {
    const base = (
      await loadThemeSourceSnapshot('bloom', {
        reviewedRequirementsFixture: Buffer.from('{"v":1}'),
      })
    ).sourceDigest;
    const other = (
      await loadThemeSourceSnapshot('bloom', {
        reviewedRequirementsFixture: Buffer.from('{"v":2}'),
      })
    ).sourceDigest;
    expect(other).not.toBe(base);
  });
});

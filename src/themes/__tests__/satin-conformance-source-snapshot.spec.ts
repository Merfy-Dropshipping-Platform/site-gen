/**
 * Task 2 — the real Satin source + compiled snapshot.
 *
 * Requires the build prerequisites, in the ONLY valid order:
 *   corepack pnpm build
 *   corepack pnpm build:blocks
 *   corepack pnpm build:theme-sections satin
 *   NODE_AUTH_TOKEN=… corepack pnpm exec tsx scripts/run-theme-build.ts satin
 *
 * These tests assert the CURRENT exact Satin source/build state through the
 * generic `loadThemeSourceSnapshot`, reached via the runnable bundle's registered
 * source adapter. Nothing here is a filename/comment inference: every block,
 * renderer, route and required source is proved against a real file or a real
 * compiled-module import. The Satin package's Header/Footer policy/schema debt is
 * asserted as-is — the snapshot ratchets it into structural codes; the tests do
 * NOT flip to accept the debt and do NOT weaken `validateBlock`.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveRunnableTheme } from '../conformance/theme-adapters';
import { loadThemeSourceSnapshot } from '../conformance/source-snapshot';
import { SATIN_SOURCE_ADAPTER } from '../conformance/satin-source-adapter';
import type { ThemeSourceSnapshot } from '../conformance/source-types';
import { satinRegistry } from '../../generator/registries/satin';

const SITES_ROOT = resolve(__dirname, '..', '..', '..');

/** Satin snapshot via the generic loader (source adapter resolved by theme id). */
async function loadSatin(): Promise<ThemeSourceSnapshot> {
  return loadThemeSourceSnapshot('satin');
}

describe('Satin runnable-bundle boundary (source adapter + release contract)', () => {
  it('resolves a complete Satin bundle (Task 3 landed the release contract)', async () => {
    // Task 2 wired the source adapter; Task 3 wired the release contract, so
    // Satin now resolves to a complete bundle for id `satin`.
    const bundle = await resolveRunnableTheme('satin');
    expect(bundle.descriptor.id).toBe('satin');
    expect(bundle.source.theme).toBe('satin');
    expect(bundle.releaseContract.theme).toBe('satin');
  });

  it('exposes the Satin source adapter with the exact repo-relative roots', () => {
    expect(SATIN_SOURCE_ADAPTER.theme).toBe('satin');
    expect(SATIN_SOURCE_ADAPTER.packageRoot).toBe('packages/theme-satin');
    expect(SATIN_SOURCE_ADAPTER.standaloneRoot).toBe('themes/satin');
    expect(SATIN_SOURCE_ADAPTER.sectionMapPath).toBe(
      'themes/satin/sections.map.json',
    );
    expect(SATIN_SOURCE_ADAPTER.generatorRegistryPath).toBe(
      'src/generator/registries/satin.ts',
    );
    // Evidence-only external audits — exactly the plan's three refs.
    const repos = SATIN_SOURCE_ADAPTER.externalAudits.map((a) => a.repository).sort();
    expect(repos).toEqual(['MerfyFrontend', 'api-gateway', 'orders']);
    for (const audit of SATIN_SOURCE_ADAPTER.externalAudits) {
      expect(audit.evidenceOnly).toBe(true);
      expect(audit.ref).toMatch(/^[0-9a-f]{40}$/);
    }
    const merfy = SATIN_SOURCE_ADAPTER.externalAudits.find(
      (a) => a.repository === 'MerfyFrontend',
    );
    expect(merfy!.ref).toBe('d3bc7581971bde7f420c58e370a5ee462f5e1bce');
  });
});

describe('loadThemeSourceSnapshot(satin) — pages & routing', () => {
  it('sees exactly nine manifest pages and NO Satin checkout-result seed', async () => {
    const snap = await loadSatin();
    expect(snap.pageSlugs).toHaveLength(9);
    expect(snap.pageSlugs).toEqual(
      expect.arrayContaining([
        '/',
        '/about',
        '/delivery',
        '/contacts',
        '/catalog',
        '/collections/preview',
        '/cart',
        '/product',
        '/checkout',
      ]),
    );
    // The theme.json seeds have no checkout-result page/source entry (Task 2 of
    // the release-train remediation adds the shell; not here).
    expect(snap.hasCheckoutResultPage).toBe(false);
    expect(snap.pageSlugs).not.toContain('/checkout-result');
  });

  it('records the recursive standalone route tree with dynamic segments', async () => {
    const snap = await loadSatin();
    const files = snap.standaloneRoutes.map((r) => r.file);
    // The required subset routes are all present.
    for (const f of [
      'themes/satin/src/pages/cart.astro',
      'themes/satin/src/pages/checkout.astro',
      'themes/satin/src/pages/catalog.astro',
      'themes/satin/src/pages/product.astro',
      'themes/satin/src/pages/account/order.astro',
    ]) {
      expect(files).toContain(f);
    }
    // Dynamic routes are retained, not filtered.
    const dynamic = snap.standaloneRoutes.filter((r) => r.dynamic).map((r) => r.file);
    expect(dynamic).toEqual(
      expect.arrayContaining([
        'themes/satin/src/pages/blog/[...slug].astro',
        'themes/satin/src/pages/legal/[slug].astro',
        'themes/satin/src/pages/products/[id].astro',
      ]),
    );
  });
});

describe('loadThemeSourceSnapshot(satin) — required runtime sources', () => {
  it('records every adapter-declared required source, all present on the ref', async () => {
    const snap = await loadSatin();
    // The declared subset is fully present at the audited Satin ref.
    expect(snap.requiredRuntimeSources).toHaveLength(
      SATIN_SOURCE_ADAPTER.requiredRuntimeSources.length,
    );
    expect(snap.requiredRuntimeSources.every((r) => r.present)).toBe(true);
    const paths = snap.requiredRuntimeSources.map((r) => r.path);
    // cart / wishlist / auth / account sources are all recorded.
    for (const f of [
      'themes/satin/src/lib/nt-cart-satin.ts',
      'themes/satin/src/lib/cart.ts',
      'themes/satin/src/lib/wishlist.ts',
      'themes/satin/src/lib/auth.ts',
      'themes/satin/src/pages/account/profile.astro',
      'themes/satin/src/pages/wishlist.astro',
      'themes/satin/src/scripts/gsap/cart-drawer.ts',
      'themes/satin/src/scripts/gsap/search.ts',
    ]) {
      expect(paths).toContain(f);
    }
  });
});

describe('loadThemeSourceSnapshot(satin) — physical blocks & full renderers', () => {
  it('enumerates the eleven physical Satin blocks keyed by (location,name)', async () => {
    const snap = await loadSatin();
    const names = snap.physicalBlocks
      .filter((b) => b.location === 'blocks')
      .map((b) => b.name)
      .sort();
    expect(names).toEqual([
      'Catalog',
      'CollapsibleSection',
      'Collections',
      'Footer',
      'Header',
      'Hero',
      'ImageWithText',
      'MainText',
      'MultiColumns',
      'MultiRows',
      'PopularProducts',
    ]);
    // A physical Catalog block exists (package-owned full renderer).
    const catalog = snap.physicalBlocks.find(
      (b) => b.name === 'Catalog' && b.location === 'blocks',
    );
    expect(catalog).toBeDefined();
    expect(catalog!.anatomy.astro).toBe(true);
  });

  it('package-owned full renderers are exactly Catalog/Header/Hero', async () => {
    const snap = await loadSatin();
    // A "full renderer" package block carries its own <Name>.astro on disk.
    const fullRenderers = snap.physicalBlocks
      .filter((b) => b.location === 'blocks' && b.anatomy.astro)
      .map((b) => b.name)
      .sort();
    expect(fullRenderers).toEqual(['Catalog', 'Header', 'Hero']);
  });

  it('config-only override directories are represented WITHOUT an invented Astro file', async () => {
    const snap = await loadSatin();
    // Footer/Collections/etc. are config-only overrides: their directory exists
    // but they have no local <Name>.astro. The snapshot represents them as-is —
    // it never fabricates a fake local renderer.
    for (const name of [
      'Footer',
      'Collections',
      'MainText',
      'MultiColumns',
      'MultiRows',
      'ImageWithText',
      'PopularProducts',
      'CollapsibleSection',
    ]) {
      const block = snap.physicalBlocks.find(
        (b) => b.name === name && b.location === 'blocks',
      );
      expect(block).toBeDefined();
      expect(block!.anatomy.astro).toBe(false);
      expect(block!.policy.missingFiles).toContain(`${name}.astro`);
    }
  });
});

describe('loadThemeSourceSnapshot(satin) — real validateBlock debt (ratcheted, not accepted)', () => {
  it('records the real Header forbidden-tsx and Footer missing-renderer debt', async () => {
    const snap = await loadSatin();
    // Header carries a forbidden .tsx (WishlistDrawer.tsx) — a real policy debt.
    const header = snap.physicalBlocks.find(
      (b) => b.name === 'Header' && b.location === 'blocks',
    );
    expect(header).toBeDefined();
    expect(header!.policy.ok).toBe(false);
    expect(header!.policy.codes).toContain('forbidden-tsx');

    // Footer is a config-only override missing its renderer — a real schema debt.
    const footer = snap.physicalBlocks.find(
      (b) => b.name === 'Footer' && b.location === 'blocks',
    );
    expect(footer).toBeDefined();
    expect(footer!.policy.ok).toBe(false);
    expect(footer!.policy.missingFiles).toContain('Footer.astro');

    // Catalog carries a hardcoded hex color — recorded as a stable policy code.
    const catalog = snap.physicalBlocks.find(
      (b) => b.name === 'Catalog' && b.location === 'blocks',
    );
    expect(catalog!.policy.ok).toBe(false);
    expect(catalog!.policy.codes).toContain('color-hex');

    // The debt is recorded as failing policy — NOT silently accepted.
    const failing = snap.physicalBlocks.filter((b) => !b.policy.ok).map((b) => b.name);
    expect(failing).toEqual(
      expect.arrayContaining(['Header', 'Footer', 'Catalog']),
    );
  });
});

describe('loadThemeSourceSnapshot(satin) — generator registry & sections map', () => {
  it('records twenty-two generator entries (distinct from manifest/sections-map)', async () => {
    const snap = await loadSatin();
    expect(snap.registry).toHaveLength(22);
    expect(snap.registry).toHaveLength(Object.keys(satinRegistry).length);
    // Catalog is a package block routed through src/components (assemble path).
    const catalog = snap.registry.find((r) => r.name === 'Catalog');
    expect(catalog).toBeDefined();
    expect(catalog!.importPath).toBe('../components/Catalog.astro');
  });

  it('records eighteen sections-map entries, each proved by its OWN Satin renderer', async () => {
    const snap = await loadSatin();
    expect(snap.sectionsMap).toHaveLength(18);
    // Each mapped block resolves to a Satin-owned compiled section module and is
    // reachable ONLY through that exact module (a base renderer cannot mask it).
    for (const rec of snap.sectionsMap) {
      expect(rec.compiledModule).not.toBeNull();
      expect(rec.compiledModule!).toContain('dist/theme-sections/satin/');
      expect(rec.compiledModule!).toContain('themes_satin_src_components');
      expect(rec.mappedRendererReachable).toBe(true);
      expect(rec.sourceExists).toBe(true);
    }
    // The exact 18 canonical keys.
    expect(snap.sectionsMap.map((r) => r.name).sort()).toEqual([
      'CartSection',
      'CollapsibleSection',
      'Collections',
      'ContactForm',
      'Footer',
      'Gallery',
      'Header',
      'Hero',
      'ImageWithText',
      'MainText',
      'MultiColumns',
      'MultiRows',
      'Newsletter',
      'PopularProducts',
      'PromoBanner',
      'Publications',
      'Slideshow',
      'Video',
    ]);
  });

  it('marks every generator renderer with a compiled default export as reachable', async () => {
    const snap = await loadSatin();
    const reachable = new Set(snap.renderersReachable);
    const registryNames = Object.keys(satinRegistry).sort();
    // On the audited ref every registry renderer resolves to a compiled module
    // with a real default export.
    for (const name of registryNames) {
      expect(reachable.has(name)).toBe(true);
    }
    // Reachability derives only from registry renderers — no stray extras.
    for (const name of snap.renderersReachable) {
      expect(registryNames).toContain(name);
    }
  });
});

describe('loadThemeSourceSnapshot(satin) — build outputs & runtime config', () => {
  it('records both standalone build outputs present', async () => {
    const snap = await loadSatin();
    expect(snap.standaloneOutputs.liveIndexHtml).toBe(true);
    expect(snap.standaloneOutputs.themeDistIndexHtml).toBe(true);
  });

  it('the COMPILED Puck controller artifact the runtime config loads from exists', () => {
    // The runtime Puck config is resolved by invoking the COMPILED controller
    // (`dist/src/controllers/theme-puck-config.controller.js`) — it must never be
    // imported from source under jest (its `__dirname` would miss dist astro-
    // blocks). This asserts the compiled artifact is present; the full runtime
    // config resolution (34 Satin components incl. Catalog/Header) is exercised
    // out-of-process, mirroring the child-process compiled-import checker.
    expect(
      existsSync(
        resolve(
          SITES_ROOT,
          'dist/src/controllers/theme-puck-config.controller.js',
        ),
      ),
    ).toBe(true);
  });
});

describe('loadThemeSourceSnapshot(satin) — determinism', () => {
  it('two Satin snapshots are byte-identical (no compiledAt / absolute path)', async () => {
    const a = await loadSatin();
    const b = await loadSatin();
    const sa = JSON.stringify(a);
    const sb = JSON.stringify(b);
    expect(sa).toBe(sb);
    expect(sa).not.toContain('compiledAt');
    expect(sa).not.toContain(SITES_ROOT);
    expect(sa).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(a.sourceDigest).toBe(b.sourceDigest);
  });
});

/**
 * Task 2 — Satin route matrix.
 *
 * Cross-checks three route sources without inferring one from another:
 *   1. the platform `PAGE_REGISTRY` (system routes shared across themes);
 *   2. the Satin theme.json manifest pages (nine seeds, no checkout-result);
 *   3. the Satin standalone Astro route tree (recursive, dynamic segments kept).
 *
 * The critical invariant (snapshot-contents #7): an allowed home-shell fallback
 * is recorded SEPARATELY from an actual dedicated route. `page-checkout-result`
 * lives in the platform registry, but Satin has NO dedicated checkout-result
 * route file and NO manifest seed — the fallback is never mistaken for a real
 * route, and a real route is never inferred from the fallback.
 *
 * Requires the four-step build.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadThemeSourceSnapshot } from '../conformance/source-snapshot';
import {
  PAGE_REGISTRY,
  isVerbatimRoute,
  getContentPages,
} from '../page-registry';

const SITES_ROOT = resolve(__dirname, '..', '..', '..');

describe('platform page registry — checkout-result is a registry route', () => {
  it('declares page-checkout-result with route "checkout-result"', () => {
    const entry = PAGE_REGISTRY.find((p) => p.id === 'page-checkout-result');
    expect(entry).toBeDefined();
    expect(entry!.route).toBe('checkout-result');
    expect(entry!.kind).toBe('content');
  });

  it('classifies verbatim vs content routes consistently', () => {
    expect(isVerbatimRoute('cart')).toBe(true);
    expect(isVerbatimRoute('product')).toBe(true);
    expect(isVerbatimRoute('checkout')).toBe(true);
    expect(isVerbatimRoute('about')).toBe(false);
    expect(isVerbatimRoute('checkout-result')).toBe(false);
    // getContentPages() keys the entry by its page id (`key` field).
    const contentKeys = getContentPages().map((p) => p.key);
    expect(contentKeys).toContain('page-checkout-result');
  });
});

describe('Satin manifest ↔ registry — no Satin checkout-result seed', () => {
  it('sees nine manifest pages and no checkout-result seed', async () => {
    const snap = await loadThemeSourceSnapshot('satin');
    expect(snap.pageSlugs).toHaveLength(9);
    expect(snap.hasCheckoutResultPage).toBe(false);
    // The registry route exists platform-wide, but Satin's manifest has no seed
    // for it — the two facts are recorded independently.
    expect(snap.pageSlugs).not.toContain('/checkout-result');
  });
});

describe('Satin standalone routes — home-shell fallback vs dedicated route', () => {
  it('has NO dedicated checkout-result route file (fallback stays a fallback)', async () => {
    const snap = await loadThemeSourceSnapshot('satin');
    const files = snap.standaloneRoutes.map((r) => r.file);
    // There is no dedicated checkout-result page on disk; the home-shell
    // fallback is never promoted to a real route.
    expect(
      files.some((f) => /checkout-result/i.test(f)),
    ).toBe(false);
    expect(
      existsSync(
        resolve(SITES_ROOT, 'themes/satin/src/pages/checkout-result.astro'),
      ),
    ).toBe(false);
  });

  it('records the verbatim system routes as real dedicated route files', async () => {
    const snap = await loadThemeSourceSnapshot('satin');
    const files = new Set(snap.standaloneRoutes.map((r) => r.file));
    // cart / product / checkout are verbatim ports with dedicated route files.
    expect(files.has('themes/satin/src/pages/cart.astro')).toBe(true);
    expect(files.has('themes/satin/src/pages/product.astro')).toBe(true);
    expect(files.has('themes/satin/src/pages/checkout.astro')).toBe(true);
    // catalog is a content page that also owns a dedicated shell.
    expect(files.has('themes/satin/src/pages/catalog.astro')).toBe(true);
  });

  it('retains dynamic routes with their bracket segments', async () => {
    const snap = await loadThemeSourceSnapshot('satin');
    const dynamic = snap.standaloneRoutes.filter((r) => r.dynamic).map((r) => r.file);
    expect(dynamic).toEqual(
      expect.arrayContaining([
        'themes/satin/src/pages/blog/[...slug].astro',
        'themes/satin/src/pages/legal/[slug].astro',
        'themes/satin/src/pages/products/[id].astro',
      ]),
    );
    // Non-dynamic routes are not misclassified.
    const cart = snap.standaloneRoutes.find(
      (r) => r.file === 'themes/satin/src/pages/cart.astro',
    );
    expect(cart!.dynamic).toBe(false);
  });

  it('discovers account/auth/blog/legal route sources for the storefront flows', async () => {
    const snap = await loadThemeSourceSnapshot('satin');
    const files = new Set(snap.standaloneRoutes.map((r) => r.file));
    for (const f of [
      'themes/satin/src/pages/account/index.astro',
      'themes/satin/src/pages/account/profile.astro',
      'themes/satin/src/pages/account/orders.astro',
      'themes/satin/src/pages/account/order.astro',
      'themes/satin/src/pages/login.astro',
      'themes/satin/src/pages/register.astro',
      'themes/satin/src/pages/wishlist.astro',
      'themes/satin/src/pages/blog/index.astro',
    ]) {
      expect(files.has(f)).toBe(true);
    }
  });
});

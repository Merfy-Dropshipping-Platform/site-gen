import { PreviewService } from '../preview.service';

// Node builtins are pulled in via dynamic import (not static top-level import)
// to match the ESM transform the production code uses — under this ts-jest ESM
// preset a static `import ... from 'node:fs/promises'` in a test file trips
// "ReferenceError: exports is not defined". preview.service.ts itself resolves
// these the same way (await import('node:fs/promises')).
async function fsp(): Promise<typeof import('node:fs/promises')> {
  return import('node:fs/promises');
}
async function nodePath(): Promise<typeof import('node:path')> {
  return import('node:path');
}

/**
 * Constructor v2 (Phase 1) — tryLoadBuiltThemeHtml gate.
 *
 * The helper returns the FULLY-BUILT theme page from
 * dist/theme-preview/<template>/index.html when present, or null so the caller
 * falls back to the legacy per-block render 1:1.
 *
 * These tests exercise the real filesystem resolution (same shape as
 * loadThemeCss) instead of mocking node:fs — we drop a temp index.html under
 * process.cwd()/dist/theme-preview/<key> and assert the gate finds it, then
 * assert a missing theme returns null.
 */
describe('PreviewService.tryLoadBuiltThemeHtml (v2 built-theme gate)', () => {
  // Unique throwaway theme keys so we never collide with real dist dirs and
  // each case starts with a clean negative cache.
  const PRESENT_KEY = `__v2test_present_${process.pid}`;
  const PRESENT_HTML =
    '<!DOCTYPE html><html><body><h1>Built theme page</h1></body></html>';
  const ABOUT_HTML =
    '<!DOCTYPE html><html><body><h1>About route page</h1></body></html>';
  let presentDir = '';

  beforeAll(async () => {
    const { mkdir, writeFile } = await fsp();
    const { resolve } = await nodePath();
    presentDir = resolve(process.cwd(), 'dist', 'theme-preview', PRESENT_KEY);
    await mkdir(presentDir, { recursive: true });
    await writeFile(resolve(presentDir, 'index.html'), PRESENT_HTML, 'utf-8');
    // Per-route page: dist/theme-preview/<key>/about/index.html
    await mkdir(resolve(presentDir, 'about'), { recursive: true });
    await writeFile(
      resolve(presentDir, 'about', 'index.html'),
      ABOUT_HTML,
      'utf-8',
    );
  });

  afterAll(async () => {
    const { rm } = await fsp();
    if (presentDir) await rm(presentDir, { recursive: true, force: true });
  });

  function makeService() {
    // Constructor v1/v2 gate never touches the Astro container/resolver, so
    // undefined deps are fine (mirrors preview.service.graceful.test.ts).
    return new PreviewService(undefined, undefined);
  }

  it('returns the built page HTML when dist/theme-preview/<id>/index.html exists', async () => {
    const svc = makeService();
    const html = await svc.tryLoadBuiltThemeHtml(PRESENT_KEY);
    expect(html).toBe(PRESENT_HTML);
  });

  it('falls back to base theme name when template_id carries a version suffix (rose-1.0 → rose)', async () => {
    const svc = makeService();
    // dist/theme-preview/<PRESENT_KEY> exists, but not <PRESENT_KEY>-1.0.
    // The helper strips the suffix and resolves the base dir.
    const html = await svc.tryLoadBuiltThemeHtml(`${PRESENT_KEY}-1.0`);
    expect(html).toBe(PRESENT_HTML);
  });

  it('returns null (legacy path) when no built page exists for the theme', async () => {
    const svc = makeService();
    const html = await svc.tryLoadBuiltThemeHtml(
      `__v2test_absent_${process.pid}`,
    );
    expect(html).toBeNull();
  });

  it('returns null for null/empty template id', async () => {
    const svc = makeService();
    expect(await svc.tryLoadBuiltThemeHtml(null)).toBeNull();
    expect(await svc.tryLoadBuiltThemeHtml(undefined)).toBeNull();
    expect(await svc.tryLoadBuiltThemeHtml('')).toBeNull();
  });

  it('loads the real A1-built rose page when present (skips otherwise)', async () => {
    const svc = makeService();
    const html = await svc.tryLoadBuiltThemeHtml('rose');
    if (html === null) {
      // A1 output not built in this environment — nothing to assert.
      return;
    }
    // Verbatim assembled page: a full HTML document, not a per-block fragment.
    expect(html).toContain('<!DOCTYPE html');
    expect(html.length).toBeGreaterThan(1000);
  });

  // ── route-awareness (Phase 1, Task 1) ──────────────────────────────────
  // Each theme's Astro build emits per-route HTML (about/index.html,
  // cart/index.html, ...). The helper takes an optional `route` and loads
  // dist/theme-preview/<key>/<route>/index.html; empty/undefined route → root.

  it('loads the per-route page (route="about" → <key>/about/index.html)', async () => {
    const svc = makeService();
    const html = await svc.tryLoadBuiltThemeHtml(PRESENT_KEY, 'about');
    expect(html).toBe(ABOUT_HTML);
  });

  it('loads root index.html when route is empty string', async () => {
    const svc = makeService();
    const html = await svc.tryLoadBuiltThemeHtml(PRESENT_KEY, '');
    expect(html).toBe(PRESENT_HTML);
  });

  it('loads root index.html when route is undefined', async () => {
    const svc = makeService();
    const html = await svc.tryLoadBuiltThemeHtml(PRESENT_KEY, undefined);
    expect(html).toBe(PRESENT_HTML);
  });

  it('returns null when the requested route page file is absent', async () => {
    const svc = makeService();
    // <PRESENT_KEY>/contacts/index.html was never written.
    const html = await svc.tryLoadBuiltThemeHtml(PRESENT_KEY, 'contacts');
    expect(html).toBeNull();
  });

  it('caches per (theme, route) — different routes do not clobber each other', async () => {
    const svc = makeService();
    // Prime both the root and the about route, then re-read: a per-(theme,route)
    // cache must keep them distinct. A theme-only cache would return one for both.
    const root1 = await svc.tryLoadBuiltThemeHtml(PRESENT_KEY, '');
    const about1 = await svc.tryLoadBuiltThemeHtml(PRESENT_KEY, 'about');
    const root2 = await svc.tryLoadBuiltThemeHtml(PRESENT_KEY, '');
    const about2 = await svc.tryLoadBuiltThemeHtml(PRESENT_KEY, 'about');
    expect(root1).toBe(PRESENT_HTML);
    expect(root2).toBe(PRESENT_HTML);
    expect(about1).toBe(ABOUT_HTML);
    expect(about2).toBe(ABOUT_HTML);
  });
});

/**
 * Constructor v2 (Phase 1, Task 3) — firstBuiltProductRoute.
 *
 * The product page's slug is `/product`, but the theme builds per-product
 * pages at dist/theme-preview/<key>/products/<id>/index.html. The helper
 * globs that directory and returns `products/<firstDir>` (or null when there
 * are no built product pages). Cached per theme.
 */
describe('PreviewService.firstBuiltProductRoute (v2 product route)', () => {
  const PROD_KEY = `__v2test_prod_${process.pid}`;
  let prodDir = '';

  beforeAll(async () => {
    const { mkdir, writeFile } = await fsp();
    const { resolve } = await nodePath();
    prodDir = resolve(process.cwd(), 'dist', 'theme-preview', PROD_KEY);
    // Two built products; firstBuiltProductRoute returns the first dir entry.
    await mkdir(resolve(prodDir, 'products', 'prod-aaa'), { recursive: true });
    await writeFile(
      resolve(prodDir, 'products', 'prod-aaa', 'index.html'),
      '<!DOCTYPE html><html><body>A</body></html>',
      'utf-8',
    );
    await mkdir(resolve(prodDir, 'products', 'prod-bbb'), { recursive: true });
    await writeFile(
      resolve(prodDir, 'products', 'prod-bbb', 'index.html'),
      '<!DOCTYPE html><html><body>B</body></html>',
      'utf-8',
    );
  });

  afterAll(async () => {
    const { rm } = await fsp();
    if (prodDir) await rm(prodDir, { recursive: true, force: true });
  });

  function makeService() {
    return new PreviewService(undefined, undefined);
  }

  it('returns products/<firstDir> when built product pages exist', async () => {
    const svc = makeService();
    const route = await svc.firstBuiltProductRoute(PROD_KEY);
    // The directory listing is sorted; prod-aaa precedes prod-bbb.
    expect(route).toBe('products/prod-aaa');
  });

  it('returns null when the theme has no built product pages', async () => {
    const svc = makeService();
    const route = await svc.firstBuiltProductRoute(
      `__v2test_prod_absent_${process.pid}`,
    );
    expect(route).toBeNull();
  });

  it('returns null for null/empty template id', async () => {
    const svc = makeService();
    expect(await svc.firstBuiltProductRoute(null)).toBeNull();
    expect(await svc.firstBuiltProductRoute(undefined)).toBeNull();
    expect(await svc.firstBuiltProductRoute('')).toBeNull();
  });
});

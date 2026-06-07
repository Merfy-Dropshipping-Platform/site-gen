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
  let presentDir = '';

  beforeAll(async () => {
    const { mkdir, writeFile } = await fsp();
    const { resolve } = await nodePath();
    presentDir = resolve(process.cwd(), 'dist', 'theme-preview', PRESENT_KEY);
    await mkdir(presentDir, { recursive: true });
    await writeFile(resolve(presentDir, 'index.html'), PRESENT_HTML, 'utf-8');
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
});

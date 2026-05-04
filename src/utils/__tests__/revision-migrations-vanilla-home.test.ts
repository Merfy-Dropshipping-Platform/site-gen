import * as RevisionMigrations from '../revision-migrations';

/**
 * 084 vanilla pilot — T013 (failing-first TDD anchor for T025).
 *
 * `migrateVanillaHomePage(pagesData, themeId)` does not yet exist;
 * implementation is scheduled for T025. This test pins the contract:
 *   1. With themeId='vanilla' and missing/empty `home.content` →
 *      seeds the canonical 10-block home array.
 *   2. With themeId='rose' (or other non-vanilla) → home.content is
 *      left untouched.
 *   3. Idempotency — calling twice on the same input returns identical
 *      output (no duplicate blocks injected).
 *
 * Once T025 lands, this test must turn green automatically.
 */
describe('migrateVanillaHomePage (084 — T013 → T025 anchor)', () => {
  // The function is exported only after T025 lands. Use feature-detection
  // so the test fails with a meaningful message while the export is
  // missing, and turns green automatically once it appears.
  type MigrateFn = (
    pagesData: Record<string, unknown>,
    themeId: string,
  ) => Record<string, unknown>;
  const fn = (
    RevisionMigrations as unknown as { migrateVanillaHomePage?: MigrateFn }
  ).migrateVanillaHomePage;

  it('migrateVanillaHomePage is exported (T025)', () => {
    expect(typeof fn).toBe('function');
  });

  it('seeds 10 vanilla home blocks when themeId="vanilla" + empty home', () => {
    if (typeof fn !== 'function') return; // anchor: see test above
    const pagesData = { home: { content: [] } };
    const out = fn(pagesData, 'vanilla');
    const home = out.home as { content: Array<{ type: string }> };
    const types = home.content.map((b) => b.type);
    expect(types).toEqual([
      'PromoBanner',
      'Header',
      'Slideshow',
      'Collections',
      'MainText',
      'Video',
      'ImageWithText',
      'PopularProducts',
      'Newsletter',
      'Footer',
    ]);
  });

  it('leaves non-vanilla themes untouched', () => {
    if (typeof fn !== 'function') return;
    const pagesData = { home: { content: [] } };
    const out = fn(pagesData, 'rose');
    const home = out.home as { content: unknown[] };
    expect(home.content).toEqual([]);
  });

  it('is idempotent — running twice yields identical home', () => {
    if (typeof fn !== 'function') return;
    const pagesData = { home: { content: [] } };
    const once = fn(pagesData, 'vanilla');
    const twice = fn(once as Record<string, unknown>, 'vanilla');
    expect(twice).toEqual(once);
  });
});

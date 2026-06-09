import { PreviewController } from '../preview.controller';
import { PreviewService } from '../../services/preview.service';
import { getPageResolver } from '../../themes/page-resolver-instance';
import { extractPageBlocks } from '../../themes/page-blocks';

// Mock the page resolver module so we can control the theme manifest's system
// pages returned by normalizeRevision({ pages: [], pagesData: {} }).
jest.mock('../../themes/page-resolver-instance', () => ({
  getPageResolver: jest.fn(),
}));
const getPageResolverMock = getPageResolver as jest.MockedFunction<
  typeof getPageResolver
>;

// extractPageBlocks moved from a private controller method to this shared
// module (refactor: extract page-blocks extraction). The fall-through test
// drives it via the module mock instead of spying on a controller instance
// method that no longer exists.
jest.mock('../../themes/page-blocks', () => ({
  extractPageBlocks: jest.fn(),
}));
const extractPageBlocksMock = extractPageBlocks as jest.MockedFunction<
  typeof extractPageBlocks
>;

/**
 * Constructor v2 (Phase 1, Tasks 2-3) — page-aware preview routing.
 *
 * getPreview must resolve the requested `page` (a pageId like `page-about` or a
 * path like `about`) to the matching page's SLUG, derive the build route from
 * it, and ask PreviewService.tryLoadBuiltThemeHtml for THAT route's built page.
 * When the route's file is present it is served verbatim (X-Preview-Mode:
 * v2-built-theme). When absent the loader returns null and control falls
 * through to extractPageBlocks/renderPreviewPage (legacy per-block render).
 *
 * We instantiate the controller directly (no Nest app) so we can spy on the
 * private loadRevisionData/extractPageBlocks and on the injected PreviewService.
 */
describe('PreviewController.getPreview — page-aware route resolution', () => {
  // Minimal Express Response double capturing status/headers/body.
  function makeRes() {
    const res: any = {
      _status: 200,
      _headers: {} as Record<string, string>,
      _body: undefined as unknown,
      status(code: number) {
        res._status = code;
        return res;
      },
      header(k: string, v: string) {
        res._headers[k] = v;
        return res;
      },
      type() {
        return res;
      },
      send(body: unknown) {
        res._body = body;
        return res;
      },
    };
    return res;
  }

  const REVISION = {
    data: {
      pages: [
        { id: 'page-home', slug: '/' },
        { id: 'page-about', slug: '/about' },
        { id: 'page-checkout', slug: '/checkout' },
      ],
    },
    publicUrl: 'https://shop.example',
    themeId: 'rose',
    revisionId: 'rev-1',
  };

  // Default: resolver returns an empty manifest (no system pages). Individual
  // tests override this to inject manifest pages. Reset before each test so the
  // legacy-revision case's override doesn't leak.
  beforeEach(() => {
    getPageResolverMock.mockReset();
    getPageResolverMock.mockReturnValue({
      normalizeRevision: () => ({ pages: [] }),
    } as never);
    extractPageBlocksMock.mockReset();
  });

  function makeController(
    preview: Partial<PreviewService>,
    revision: typeof REVISION = REVISION,
  ) {
    // Фаза 2: getPreview сначала спрашивает hasV2Sections; эти тесты проверяют
    // блоб-путь (built-theme), который активен когда v2-секций НЕТ. Дефолтим
    // false, чтобы форк пропускался и поведение оставалось как до Фазы 2.
    // Тест, которому нужна v2-ветка, передаёт свой hasV2Sections явно.
    const withDefaults: Partial<PreviewService> = {
      hasV2Sections: jest.fn().mockResolvedValue(false),
      ...preview,
    };
    const ctrl = new PreviewController(
      withDefaults as PreviewService,
      {} as never,
    );
    // loadRevisionData is private and hits the DB — stub it on the instance.
    jest
      .spyOn(ctrl as any, 'loadRevisionData')
      .mockResolvedValue(revision as any);
    return ctrl;
  }

  it('page=/about resolves to route "about" and serves the built page', async () => {
    const tryLoad = jest
      .fn()
      .mockResolvedValue('<!DOCTYPE html><html>ABOUT</html>');
    const ctrl = makeController({
      tryLoadBuiltThemeHtml: tryLoad,
      firstBuiltProductRoute: jest.fn(),
    } as any);
    const res = makeRes();

    await ctrl.getPreview('site-1', '/about', undefined, res);

    expect(tryLoad).toHaveBeenCalledWith('rose', 'about');
    expect(res._body).toBe('<!DOCTYPE html><html>ABOUT</html>');
    expect(res._headers['X-Preview-Mode']).toBe('v2-built-theme');
  });

  it('page=page-about (constructor pageId form) also resolves to route "about"', async () => {
    const tryLoad = jest
      .fn()
      .mockResolvedValue('<!DOCTYPE html><html>ABOUT</html>');
    const ctrl = makeController({
      tryLoadBuiltThemeHtml: tryLoad,
      firstBuiltProductRoute: jest.fn(),
    } as any);
    const res = makeRes();

    await ctrl.getPreview('site-1', 'page-about', undefined, res);

    expect(tryLoad).toHaveBeenCalledWith('rose', 'about');
  });

  it('home page resolves to root route ("")', async () => {
    const tryLoad = jest
      .fn()
      .mockResolvedValue('<!DOCTYPE html><html>HOME</html>');
    const ctrl = makeController({
      tryLoadBuiltThemeHtml: tryLoad,
      firstBuiltProductRoute: jest.fn(),
    } as any);
    const res = makeRes();

    await ctrl.getPreview('site-1', 'home', undefined, res);

    expect(tryLoad).toHaveBeenCalledWith('rose', '');
  });

  it('page=/checkout with no built page falls through to extractPageBlocks/renderPreviewPage', async () => {
    // Loader returns null → control must drop to the legacy per-block render.
    const tryLoad = jest.fn().mockResolvedValue(null);
    const renderPreviewPage = jest
      .fn()
      .mockResolvedValue('<html>RENDERED CHECKOUT</html>');
    const ctrl = makeController({
      tryLoadBuiltThemeHtml: tryLoad,
      firstBuiltProductRoute: jest.fn(),
      renderPreviewPage,
    } as any);
    extractPageBlocksMock.mockResolvedValue([{ type: 'Hero', props: {} }]);
    const res = makeRes();

    await ctrl.getPreview('site-1', '/checkout', undefined, res);

    expect(tryLoad).toHaveBeenCalledWith('rose', 'checkout');
    expect(extractPageBlocksMock).toHaveBeenCalled();
    expect(renderPreviewPage).toHaveBeenCalled();
    expect(res._body).toBe('<html>RENDERED CHECKOUT</html>');
    // The built-theme header must NOT be set on the fall-through path.
    expect(res._headers['X-Preview-Mode']).toBeUndefined();
  });

  it('product page resolves to the first built product route', async () => {
    const tryLoad = jest
      .fn()
      .mockResolvedValue('<!DOCTYPE html><html>PRODUCT</html>');
    const firstBuiltProductRoute = jest
      .fn()
      .mockResolvedValue('products/prod-aaa');
    const ctrl = makeController({
      tryLoadBuiltThemeHtml: tryLoad,
      firstBuiltProductRoute,
    } as any);
    const res = makeRes();

    await ctrl.getPreview('site-1', '/product', undefined, res);

    expect(firstBuiltProductRoute).toHaveBeenCalledWith('rose');
    expect(tryLoad).toHaveBeenCalledWith('rose', 'products/prod-aaa');
    expect(res._body).toBe('<!DOCTYPE html><html>PRODUCT</html>');
  });

  it('legacy revision missing page-collection from raw pages[] resolves via theme manifest to "collections/preview"', async () => {
    // Legacy revision: raw `pages[]` does NOT contain page-collection (its
    // system pages were never persisted; migrateRevisionData does not backfill
    // the array). Without the manifest merge, `match` is undefined and the route
    // falls back to the raw `page` value ('page-collection') → built theme MISS.
    const LEGACY_REVISION = {
      data: {
        pages: [
          { id: 'page-home', slug: '/' },
          { id: 'page-about', slug: '/about' },
        ],
      },
      publicUrl: 'https://shop.example',
      themeId: 'rose',
      revisionId: 'rev-legacy',
    } as typeof REVISION;

    // Theme manifest DOES define page-collection → /collections/preview.
    getPageResolverMock.mockReturnValue({
      normalizeRevision: () => ({
        pages: [
          { id: 'page-home', slug: '/', role: 'system' },
          { id: 'page-collection', slug: '/collections/preview', role: 'system' },
          { id: 'page-product', slug: '/product', role: 'system' },
        ],
      }),
    } as never);

    const tryLoad = jest
      .fn()
      .mockResolvedValue('<!DOCTYPE html><html>COLLECTION</html>');
    const ctrl = makeController(
      {
        tryLoadBuiltThemeHtml: tryLoad,
        firstBuiltProductRoute: jest.fn(),
      } as any,
      LEGACY_REVISION,
    );
    const res = makeRes();

    await ctrl.getPreview('site-1', 'page-collection', undefined, res);

    expect(getPageResolverMock).toHaveBeenCalledWith('rose');
    // Route resolves to the manifest slug, NOT the raw 'page-collection'.
    expect(tryLoad).toHaveBeenCalledWith('rose', 'collections/preview');
    expect(tryLoad).not.toHaveBeenCalledWith('rose', 'page-collection');
    expect(res._body).toBe('<!DOCTYPE html><html>COLLECTION</html>');
    expect(res._headers['X-Preview-Mode']).toBe('v2-built-theme');
  });

  it('manifest-less theme + revision without page-collection resolves via SYSTEM_PAGE_ROUTES to "collections/preview"', async () => {
    // bloom/flux/satin/vanilla theme.json have NO pages registry, so the
    // manifest merge contributes nothing (normalizeRevision → { pages: [] }).
    // The revision also lacks page-collection (lazy-added by normalization but
    // absent from raw pages[]). Without the universal SYSTEM_PAGE_ROUTES
    // fallback, `match` is undefined and route falls back to the raw
    // 'page-collection' value → built theme MISS → block-render.
    const MANIFESTLESS_REVISION = {
      data: {
        pages: [
          { id: 'page-home', slug: '/' },
          { id: 'page-about', slug: '/about' },
        ],
      },
      publicUrl: 'https://shop.example',
      themeId: 'bloom',
      revisionId: 'rev-manifestless',
    } as typeof REVISION;

    // Theme manifest has NO system pages (matches bloom/flux/satin/vanilla).
    getPageResolverMock.mockReturnValue({
      normalizeRevision: () => ({ pages: [] }),
    } as never);

    const tryLoad = jest
      .fn()
      .mockResolvedValue('<!DOCTYPE html><html>COLLECTION</html>');
    const ctrl = makeController(
      {
        tryLoadBuiltThemeHtml: tryLoad,
        firstBuiltProductRoute: jest.fn(),
      } as any,
      MANIFESTLESS_REVISION,
    );
    const res = makeRes();

    await ctrl.getPreview('site-1', 'page-collection', undefined, res);

    // Route resolves via the constant, NOT the raw 'page-collection'.
    expect(tryLoad).toHaveBeenCalledWith('bloom', 'collections/preview');
    expect(tryLoad).not.toHaveBeenCalledWith('bloom', 'page-collection');
    expect(res._body).toBe('<!DOCTYPE html><html>COLLECTION</html>');
    expect(res._headers['X-Preview-Mode']).toBe('v2-built-theme');
  });

  it('manifest-less theme: page=home resolves to root route ("") via SYSTEM_PAGE_ROUTES', async () => {
    // Even with no manifest pages and a revision that omits page-home, `home`
    // must resolve to the root route '' (SYSTEM_PAGE_ROUTES.home = '').
    const MANIFESTLESS_REVISION = {
      data: {
        pages: [{ id: 'page-about', slug: '/about' }],
      },
      publicUrl: 'https://shop.example',
      themeId: 'vanilla',
      revisionId: 'rev-home',
    } as typeof REVISION;

    getPageResolverMock.mockReturnValue({
      normalizeRevision: () => ({ pages: [] }),
    } as never);

    const tryLoad = jest
      .fn()
      .mockResolvedValue('<!DOCTYPE html><html>HOME</html>');
    const ctrl = makeController(
      {
        tryLoadBuiltThemeHtml: tryLoad,
        firstBuiltProductRoute: jest.fn(),
      } as any,
      MANIFESTLESS_REVISION,
    );
    const res = makeRes();

    await ctrl.getPreview('site-1', 'home', undefined, res);

    expect(tryLoad).toHaveBeenCalledWith('vanilla', '');
  });

  it('revision page slug takes precedence over the theme manifest (manifest fills gaps only)', async () => {
    // Both revision and manifest define page-about, but with DIFFERENT slugs.
    // The merchant's revision slug must win; the manifest only fills missing ids.
    const OVERRIDE_REVISION = {
      data: {
        pages: [
          { id: 'page-home', slug: '/' },
          { id: 'page-about', slug: '/about-us' },
        ],
      },
      publicUrl: 'https://shop.example',
      themeId: 'rose',
      revisionId: 'rev-override',
    } as typeof REVISION;

    getPageResolverMock.mockReturnValue({
      normalizeRevision: () => ({
        pages: [{ id: 'page-about', slug: '/about', role: 'system' }],
      }),
    } as never);

    const tryLoad = jest
      .fn()
      .mockResolvedValue('<!DOCTYPE html><html>ABOUT</html>');
    const ctrl = makeController(
      {
        tryLoadBuiltThemeHtml: tryLoad,
        firstBuiltProductRoute: jest.fn(),
      } as any,
      OVERRIDE_REVISION,
    );
    const res = makeRes();

    await ctrl.getPreview('site-1', 'page-about', undefined, res);

    // Revision slug '/about-us' wins over manifest '/about'.
    expect(tryLoad).toHaveBeenCalledWith('rose', 'about-us');
    expect(tryLoad).not.toHaveBeenCalledWith('rose', 'about');
  });

  // ——— Фаза 2 (слайсинг): v2-sections форк контентных страниц ———

  it('v2-sections: контентная страница нарезанной темы рендерится по-секционно (блоб не зовётся)', async () => {
    const tryLoad = jest.fn().mockResolvedValue('<html>BLOB</html>');
    const renderV2ContentPage = jest
      .fn()
      .mockResolvedValue('<html><head></head><body>V2-SECTIONS</body></html>');
    const ctrl = makeController({
      hasV2Sections: jest.fn().mockResolvedValue(true),
      renderV2ContentPage,
      tryLoadBuiltThemeHtml: tryLoad,
      firstBuiltProductRoute: jest.fn(),
    } as any);
    extractPageBlocksMock.mockResolvedValue([
      { type: 'Hero', props: { id: 'Hero-1' } },
    ]);
    const res = makeRes();

    await ctrl.getPreview('site-1', 'home', undefined, res);

    expect(renderV2ContentPage).toHaveBeenCalledWith(
      expect.objectContaining({ themeId: 'rose', route: '' }),
    );
    expect(tryLoad).not.toHaveBeenCalled();
    expect(res._headers['X-Preview-Mode']).toBe('v2-sections');
    // injectPreviewGlobals добавил siteId-глобал в head.
    expect(String(res._body)).toContain('__MERFY_SITE_ID__');
    expect(String(res._body)).toContain('V2-SECTIONS');
  });

  it('v2-sections: null от renderV2ContentPage (нет шелла) → фоллбек в блоб-путь', async () => {
    const tryLoad = jest.fn().mockResolvedValue('<html><head></head>BLOB</html>');
    const renderV2ContentPage = jest.fn().mockResolvedValue(null);
    const ctrl = makeController({
      hasV2Sections: jest.fn().mockResolvedValue(true),
      renderV2ContentPage,
      tryLoadBuiltThemeHtml: tryLoad,
      firstBuiltProductRoute: jest.fn(),
    } as any);
    extractPageBlocksMock.mockResolvedValue([{ type: 'Hero', props: {} }]);
    const res = makeRes();

    await ctrl.getPreview('site-1', 'home', undefined, res);

    expect(renderV2ContentPage).toHaveBeenCalled();
    expect(tryLoad).toHaveBeenCalledWith('rose', '');
    expect(res._headers['X-Preview-Mode']).toBe('v2-built-theme');
  });

  it('v2-sections: сложный роут (checkout) идёт в обход форка прямо в блоб', async () => {
    const tryLoad = jest.fn().mockResolvedValue('<html><head></head>CHECKOUT</html>');
    const renderV2ContentPage = jest.fn();
    const ctrl = makeController({
      hasV2Sections: jest.fn().mockResolvedValue(true),
      renderV2ContentPage,
      tryLoadBuiltThemeHtml: tryLoad,
      firstBuiltProductRoute: jest.fn(),
    } as any);
    const res = makeRes();

    await ctrl.getPreview('site-1', '/checkout', undefined, res);

    expect(renderV2ContentPage).not.toHaveBeenCalled();
    expect(tryLoad).toHaveBeenCalledWith('rose', 'checkout');
    expect(res._headers['X-Preview-Mode']).toBe('v2-built-theme');
  });

  it('v2-sections: бросок внутри форка деградирует в блоб-путь, не в 500', async () => {
    const tryLoad = jest.fn().mockResolvedValue('<html><head></head>BLOB</html>');
    const renderV2ContentPage = jest
      .fn()
      .mockRejectedValue(new Error('boom'));
    const ctrl = makeController({
      hasV2Sections: jest.fn().mockResolvedValue(true),
      renderV2ContentPage,
      tryLoadBuiltThemeHtml: tryLoad,
      firstBuiltProductRoute: jest.fn(),
    } as any);
    extractPageBlocksMock.mockResolvedValue([{ type: 'Hero', props: {} }]);
    const res = makeRes();

    await ctrl.getPreview('site-1', 'home', undefined, res);

    expect(res._status).toBe(200);
    expect(res._headers['X-Preview-Mode']).toBe('v2-built-theme');
    expect(String(res._body)).toContain('BLOB');
  });
});

import { PreviewController } from '../preview.controller';
import { PreviewService } from '../../services/preview.service';

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

  function makeController(preview: Partial<PreviewService>) {
    const ctrl = new PreviewController(preview as PreviewService, {} as never);
    // loadRevisionData is private and hits the DB — stub it on the instance.
    jest
      .spyOn(ctrl as any, 'loadRevisionData')
      .mockResolvedValue(REVISION as any);
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
    const extractSpy = jest
      .spyOn(ctrl as any, 'extractPageBlocks')
      .mockResolvedValue([{ type: 'Hero', props: {} }]);
    const res = makeRes();

    await ctrl.getPreview('site-1', '/checkout', undefined, res);

    expect(tryLoad).toHaveBeenCalledWith('rose', 'checkout');
    expect(extractSpy).toHaveBeenCalled();
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
});

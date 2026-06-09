import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Logger,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { PreviewService } from '../services/preview.service';
import * as schema from '../db/schema';
import { PG_CONNECTION } from '../constants';
import { googleFontHead } from '../themes/theme-manifest-loader';
import { getPageResolver } from '../themes/page-resolver-instance';
import { buildTokensCss } from '../themes/tokens-css';
import { extractPageBlocks } from '../themes/page-blocks';
import { migrateRevisionData } from '../utils/revision-migrations';
import { rewriteRootUrlsToPrefix } from '../generator/theme-build.service';

/**
 * Canonical system page id → build route. Universal across themes (the 8 system
 * pages have fixed slugs). Used as the final route fallback when a page is in
 * neither the raw revision nor the theme manifest (legacy revisions + themes
 * whose theme.json has no `pages` registry, e.g. bloom/flux/satin/vanilla).
 */
const SYSTEM_PAGE_ROUTES: Record<string, string> = {
  home: '',
  'page-about': 'about',
  'page-contacts': 'contacts',
  'page-catalog': 'catalog',
  'page-collection': 'collections/preview',
  'page-cart': 'cart',
  'page-product': 'product',
  'page-checkout': 'checkout',
};

/** Первые сегменты маршрутов, которые в Фазе 2 НЕ нарезаются (блоб-путь). */
const V2_COMPLEX_ROUTE_PREFIXES = new Set([
  'catalog', 'collection', 'collections', 'product', 'products', 'cart',
  'checkout', 'auth', 'blog', 'legal', 'account', 'design-system', 'puck-editor',
]);

/**
 * Body for POST /api/sites/:id/preview/block — single-block hot-render
 * used by the iframe's `update-block` postMessage handler in the constructor
 * (spec 082 Stage 1, T2/T5). `blockType` is required; `props` may be empty;
 * `themeId` falls back to base resolver when omitted/null.
 */
interface RenderBlockBody {
  blockType: string;
  props: Record<string, unknown>;
  themeId?: string | null;
}

/**
 * Body for POST /api/sites/:id/preview/tokens-css — tokens.css hot-render
 * used by the iframe's `update-tokens` postMessage handler in the constructor
 * (spec 082 Stage 2a, N4). Symmetric to RenderBlockBody but renders the
 * full tokens.css string instead of a single block. `themeSettings` is
 * required (constructor sends the full themeSettings object); `themeId`
 * falls back to the manifest defaults when omitted/null.
 */
interface RenderTokensCssBody {
  themeSettings: Record<string, unknown>;
  themeId?: string | null;
}

/**
 * GET /api/sites/:id/preview — renders the constructor's iframe preview for
 * the site's active revision. Phase 0 shipped as a hardcoded stub; Phase 1c
 * wires it to real site_revision data so the iframe shows the user's actual
 * page content.
 *
 * Response is HTML produced by PreviewService.renderPreviewPage (Astro
 * Container API). The page name comes from the `page` query param; the
 * controller resolves it against `data.pagesData[page].content` in the
 * current revision.
 *
 * Endpoint is PUBLIC by design — the constructor's iframe loads without
 * cookies. If a site/revision isn't found we return 404 with a tiny HTML
 * body so the iframe shows a visible error instead of NestJS's JSON.
 */
@Controller('api/sites/:id/preview')
export class PreviewController {
  private readonly logger = new Logger(PreviewController.name);

  /**
   * Rendered preview HTML cache keyed by (siteId, revisionId, page, productId).
   * revisionId is part of the key — when a constructor save creates a new
   * revision, currentRevisionId changes and old cache entries are simply not
   * looked up again (and get LRU-evicted in time). No explicit invalidation
   * needed; stale HTML is impossible by construction.
   *
   * Simple Map-based LRU: on read, re-insert to refresh order; on write, evict
   * oldest if over MAX. ~150-300KB per entry × 300 entries ≈ 45-90MB ceiling.
   */
  private static htmlCache = new Map<string, string>();
  private static readonly MAX_HTML_CACHE = 300;

  private static getCachedHtml(key: string): string | undefined {
    const v = PreviewController.htmlCache.get(key);
    if (v !== undefined) {
      // LRU bump: delete + reinsert so this key becomes the newest.
      PreviewController.htmlCache.delete(key);
      PreviewController.htmlCache.set(key, v);
    }
    return v;
  }

  private static setCachedHtml(key: string, html: string): void {
    if (PreviewController.htmlCache.size >= PreviewController.MAX_HTML_CACHE) {
      const oldest = PreviewController.htmlCache.keys().next().value;
      if (oldest !== undefined) PreviewController.htmlCache.delete(oldest);
    }
    PreviewController.htmlCache.set(key, html);
  }

  constructor(
    private readonly preview: PreviewService,
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  @Get()
  async getPreview(
    @Param('id') siteId: string,
    @Query('page') page: string = 'home',
    @Query('productId') productIdOverride: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    // pagesData uses inconsistent keys depending on migration:
    //   * 'home', 'checkout', 'cart' (live storefront uses these)
    //   * 'page-product', 'page-checkout' (constructor sends these)
    // We try the input as-is, then both prefix variants. extractPageBlocks
    // accepts the resolved key.
    const normalizedPage = (() => {
      const trimmed = (page ?? 'home').replace(/^\/+|\/+$/g, '');
      return trimmed === '' ? 'home' : trimmed;
    })();
    this.logger.log(
      `[preview] siteId=${siteId} page=${page}→${normalizedPage} productIdOverride=${productIdOverride ?? 'NONE'}`,
    );
    page = normalizedPage;
    const loaded = await this.loadRevisionData(siteId);
    if (!loaded) {
      res
        .status(404)
        .type('text/html')
        .send(this.errorPage(`Site ${siteId} has no active revision`));
      return;
    }

    // Constructor v2 (Phase 1) short-circuit. The site's theme_id resolves to
    // a template_id (loaded.themeId). If ThemeBuildService has produced a fully
    // assembled page for the requested route at
    // dist/theme-preview/<template>/<route>/index.html (root → index.html),
    // serve that whole page verbatim — the верстальщик's theme as-is —
    // bypassing extractPageBlocks/renderPreviewPage entirely.
    //
    // Resolve the route from the requested page's SLUG. `page` is already a
    // slash-less string (a pageId like `page-about` OR a path like `about`);
    // we match it against the revision's pages (by id, page-prefixed id, or
    // trimmed slug) and derive the build route from the matched slug. The
    // `home` slug maps to the root route ('').
    const revisionPages: any[] = Array.isArray((loaded.data as any)?.pages)
      ? (loaded.data as any).pages
      : [];
    // Legacy revisions may omit system pages from raw `pages[]` (migrateRevisionData
    // doesn't backfill the array), so merge in the theme manifest's system pages to
    // resolve their slug → build route. Manifest is the authoritative id→slug source.
    let manifestPages: any[] = [];
    if (loaded.themeId) {
      try {
        manifestPages = getPageResolver(loaded.themeId)
          .normalizeRevision({ pages: [], pagesData: {} })
          .pages as any[];
      } catch {
        // resolver unavailable — fall back to revision pages only
      }
    }
    const lookupPages = [
      ...revisionPages,
      ...manifestPages.filter(
        (mp) => !revisionPages.some((p) => p?.id === mp?.id),
      ),
    ];
    const match = lookupPages.find(
      (p) =>
        p?.id === page ||
        p?.id === `page-${page}` ||
        (p?.slug ?? '').replace(/^\/+|\/+$/g, '') === page,
    );
    let route: string;
    if (match?.slug) {
      route = match.slug.replace(/^\/+|\/+$/g, '');
    } else {
      // No revision/manifest page → universal system-page route map (covers themes
      // without a pages manifest + legacy revisions missing the page).
      const sysKey = page.startsWith('page-') ? page : `page-${page}`;
      route = SYSTEM_PAGE_ROUTES[page] ?? SYSTEM_PAGE_ROUTES[sysKey] ?? page;
    }
    if (route === 'home') route = '';
    this.logger.log(
      `[preview] siteId=${siteId} page=${page} → route=${route || '(root)'}`,
    );
    // The product page's slug is `/product`, but the theme builds per-product
    // pages at <template>/products/<id>/index.html. Resolve to the first built
    // product; if none, the literal 'product' route will miss → fall through.
    if (route === 'product' || match?.id === 'page-product') {
      route =
        (await this.preview.firstBuiltProductRoute(loaded.themeId)) ?? 'product';
    }

    // Фаза 2 (слайсинг): контентные страницы v2-темы идут по-секционно,
    // чтобы конструктор мог выделять/править/таскать секции. Сложные
    // страницы (catalog/product/cart/checkout/…) остаются на блоб-пути.
    // Любой сбой v2-ветки ОБЯЗАН деградировать в блоб-путь, не в 500 —
    // отсюда try/catch-ремень вокруг всей ветки.
    const isComplexRoute = V2_COMPLEX_ROUTE_PREFIXES.has(route.split('/')[0]);
    if (!isComplexRoute && (await this.preview.hasV2Sections(loaded.themeId))) {
      try {
        const v2Blocks = await extractPageBlocks(
          loaded.data,
          page,
          loaded.publicUrl,
          loaded.themeId,
          siteId,
          productIdOverride,
          this.logger,
        );
        if (v2Blocks && v2Blocks.length > 0) {
          const pageTitle =
            typeof match?.name === 'string' ? match.name : undefined;
          const v2Html = await this.preview.renderV2ContentPage({
            themeId: loaded.themeId!,
            route,
            blocks: v2Blocks,
            titleOverride: pageTitle,
          });
          if (v2Html !== null) {
            const finalHtml = this.injectPreviewGlobals(v2Html, siteId);
            this.logger.log(
              `[preview] v2-sections page site=${siteId} route=${route || '(root)'} blocks=${v2Blocks.length}`,
            );
            res
              .header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
              .header('Pragma', 'no-cache')
              .header('Expires', '0')
              .header('X-Preview-Mode', 'v2-sections')
              .type('text/html')
              .send(finalHtml);
            return;
          }
        }
        // блоков/шелла нет → проваливаемся в блоб-путь как раньше (страховка)
      } catch (err: unknown) {
        const e = err as Error;
        this.logger.error(
          `[preview] v2-sections render failed for site=${siteId} route=${route || '(root)'} — falling back to built theme: ${e?.message ?? e}`,
          e?.stack,
        );
        // фоллбек в блоб-путь ниже
      }
    }
    //
    // Strictly gated on file existence: tryLoadBuiltThemeHtml returns null when
    // there's no built page for that route, and we fall through to the legacy
    // per-block path unchanged (1:1 behaviour). Phase 1 is read-only (no Puck
    // editing), so the `productId` param and the render cache are intentionally
    // skipped on the built-theme path.
    const builtThemeHtml = await this.preview.tryLoadBuiltThemeHtml(
      loaded.themeId,
      route,
    );
    if (builtThemeHtml !== null) {
      // Инжектим реальный shopId (= siteId) + DaData-токен + siteId-глобал в
      // отдаваемый preview-HTML — зеркалим патч build.service.ts на деплое
      // (`const shopId = ""` → siteId), токен DaData (как легаси render-путь) и
      // __MERFY_SITE_ID__ для гидрации товаров (built-theme отдаётся БЕЗ
      // per-site products.json → storefront-hydrate фолбэчит на storefront-data).
      const html = this.injectPreviewGlobals(builtThemeHtml, siteId);
      this.logger.log(
        `[preview] v2 served built theme page for site=${siteId} theme=${loaded.themeId} route=${route || '(root)'} (${html.length} bytes)`,
      );
      res
        .header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        .header('Pragma', 'no-cache')
        .header('Expires', '0')
        .header('X-Preview-Mode', 'v2-built-theme')
        .type('text/html')
        .send(html);
      return;
    }

    // Cache lookup BEFORE doing extractPageBlocks/render. Key includes the
    // current revisionId so any constructor save (new revision) yields a
    // different key and the new content is rendered fresh.
    const cacheKey = `${siteId}:${loaded.revisionId}:${page}:${productIdOverride ?? ''}`;
    const cachedHtml = PreviewController.getCachedHtml(cacheKey);
    if (cachedHtml !== undefined) {
      res
        .header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        .header('Pragma', 'no-cache')
        .header('Expires', '0')
        .header('X-Preview-Cache', 'hit')
        .type('text/html')
        .send(cachedHtml);
      return;
    }

    const blocks = await extractPageBlocks(
      loaded.data,
      page,
      loaded.publicUrl,
      loaded.themeId,
      siteId,
      productIdOverride,
      this.logger,
    );
    if (!blocks) {
      res
        .status(404)
        .type('text/html')
        .send(this.errorPage(`Page "${page}" not found in site ${siteId}`));
      return;
    }

    try {
      const html = await this.preview.renderPreviewPage({
        blocks,
        tokensCss: this.tokensCssFromSettings(loaded.data, loaded.themeId),
        fontHead: googleFontHead(loaded.themeId),
        themeId: loaded.themeId,
        page,
        siteId,
        publicUrl: loaded.publicUrl,
      });
      PreviewController.setCachedHtml(cacheKey, html);
      // Disable browser cache for preview iframe — Constructor вылитый
      // на свежий код мог отдавать stale HTML из browser cache (etag 304),
      // даже после deploy свежей render-логики. no-cache+no-store+revalidate
      // гарантирует что iframe всегда дёргает актуальный server render.
      res
        .header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        .header('Pragma', 'no-cache')
        .header('Expires', '0')
        .type('text/html')
        .send(html);
    } catch (err: unknown) {
      // Log full stack so ops can diagnose; send a readable 500 body to the
      // iframe instead of the generic NestJS JSON so the constructor shows
      // something debuggable.
      const e = err as Error;
      this.logger.error(
        `Preview render failed for site=${siteId} page=${page}: ${e?.message ?? e}`,
        e?.stack,
      );
      res
        .status(500)
        .type('text/html')
        .send(this.errorPage(`Render failed: ${e?.message ?? 'unknown'}`));
    }
  }

  /**
   * POST /api/sites/:id/preview/block — render a SINGLE block to HTML.
   *
   * Used by the constructor iframe's `update-block` postMessage handler so
   * editing a Puck prop hot-swaps just one block instead of reloading the
   * full preview page. Auth-free like @Get() above (iframe loads without
   * cookies). Body: { blockType, props, themeId? }. Returns text/html.
   *
   * 400 — blockType missing/empty.
   * 500 — render failed (HTML comment body so iframe can show debuggable
   *       text instead of NestJS JSON).
   */
  @Post('block')
  @HttpCode(200)
  async renderBlock(
    @Param('id') siteId: string,
    @Body() body: RenderBlockBody,
    @Res() res: Response,
  ): Promise<void> {
    if (!body?.blockType || typeof body.blockType !== 'string') {
      throw new BadRequestException('blockType is required');
    }
    try {
      // Inject siteId в props — Product.astro и подобные используют
      // Astro.props.siteId для server-side fetch товара из storefront-data
      // когда products.json отсутствует (preview path). Без siteId
      // Product.astro рендерил empty placeholder при hot-replace.
      const propsWithContext = {
        ...(body.props ?? {}),
        siteId,
      };
      let html = await this.preview.renderBlock({
        blockName: body.blockType,
        props: propsWithContext,
        themeId: body.themeId ?? null,
        // POST /preview/block ALWAYS called from constructor iframe —
        // граceful stub визибл при missing/broken (spec 092 Q3 C).
        isPreview: true,
      });
      // Фаза 2: для v2-тем переписываем корневые URL блока под /__theme/<тема>,
      // чтобы hot-replaced секция тянула ассеты темы (как composeV2Page при
      // первичном рендере). На legacy-темах (нет theme-sections) — no-op.
      if (body.themeId && (await this.preview.hasV2Sections(body.themeId))) {
        html = rewriteRootUrlsToPrefix(
          html,
          `/__theme/${PreviewService.bareThemeKey(body.themeId)}`,
        );
      }
      res.type('text/html').send(html);
    } catch (err: unknown) {
      const e = err as Error;
      this.logger.error(
        `[preview-block] site=${siteId} render failed for blockType=${body.blockType}: ${e?.message ?? e}`,
        e?.stack,
      );
      res
        .status(500)
        .type('text/html')
        .send(`<!-- render error: ${e?.message ?? 'unknown'} -->`);
    }
  }

  /**
   * POST /api/sites/:id/preview/tokens-css — render tokens.css text from
   * a `themeSettings` object.
   *
   * Used by the constructor iframe's `update-tokens` postMessage handler so
   * editing a theme-level token (radii, fonts, color schemes, etc) hot-swaps
   * the `<style id="__merfy_tokens_css">` content instead of reloading the
   * full preview page. Auth-free like sibling endpoints (iframe loads without
   * cookies). Body: { themeSettings, themeId? }. Returns text/css.
   *
   * 400 — body missing/invalid.
   * 500 — generation failed (CSS comment body so iframe can show debuggable
   *       text instead of NestJS JSON, even though the style tag swap is a
   *       no-op on parse error).
   */
  @Post('tokens-css')
  @HttpCode(200)
  async renderTokensCss(
    @Body() body: RenderTokensCssBody,
    @Res() res: Response,
  ): Promise<void> {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('themeSettings required');
    }
    try {
      const css = buildTokensCss(body.themeSettings ?? {}, body.themeId ?? null);
      res.type('text/css').send(css);
    } catch (err: unknown) {
      const e = err as Error;
      this.logger.error(
        `[preview-tokens-css] failed for themeId=${body.themeId}: ${e?.message ?? e}`,
        e?.stack,
      );
      res
        .status(500)
        .type('text/css')
        .send(`/* tokens-css render error: ${e?.message ?? 'unknown'} */`);
    }
  }

  private async loadRevisionData(siteId: string): Promise<{
    data: Record<string, unknown>;
    publicUrl: string | null;
    themeId: string | null;
    revisionId: string;
  } | null> {
    const [site] = await this.db
      .select({
        currentRevisionId: schema.site.currentRevisionId,
        publicUrl: schema.site.publicUrl,
        themeId: schema.site.themeId,
      })
      .from(schema.site)
      .where(eq(schema.site.id, siteId));
    if (!site?.currentRevisionId) return null;

    const [rev] = await this.db
      .select({ data: schema.siteRevision.data })
      .from(schema.siteRevision)
      .where(eq(schema.siteRevision.id, site.currentRevisionId));
    if (!rev?.data) return null;

    return {
      data: migrateRevisionData(
        rev.data as Record<string, unknown>,
        site.themeId ?? null,
      ),
      publicUrl: site.publicUrl ?? null,
      themeId: site.themeId ?? null,
      revisionId: site.currentRevisionId,
    };
  }

  private tokensCssFromSettings(
    data: Record<string, unknown>,
    themeId: string | null,
  ): string {
    return buildTokensCss(data.themeSettings, themeId);
  }

  /** Инжекты в HTML превью: shopId, DaData-токен, siteId для гидрации товаров. */
  private injectPreviewGlobals(htmlIn: string, siteId: string): string {
    let html = htmlIn.replace(/const shopId = "";/g, `const shopId = "${siteId}";`);
    const dadataToken = process.env.DADATA_API_KEY;
    if (dadataToken) {
      html = html.replace(
        /<head(\s[^>]*)?>/i,
        (m) => `${m}<script>window.__DADATA_TOKEN__ = ${JSON.stringify(dadataToken)};</script>`,
      );
    }
    html = html.replace(
      /<head(\s[^>]*)?>/i,
      (m) => `${m}<script>window.__MERFY_SITE_ID__ = ${JSON.stringify(siteId)};</script>`,
    );
    return html;
  }

  private errorPage(message: string): string {
    const safe = message.replace(/[&<>]/g, (c) =>
      c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;',
    );
    return `<!DOCTYPE html><html><body style="font-family:system-ui;padding:24px;color:#666"><h1 style="margin:0 0 8px">Preview error</h1><p>${safe}</p></body></html>`;
  }
}

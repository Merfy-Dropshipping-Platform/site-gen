import { Controller, Get, Inject, Logger, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { PreviewService } from '../services/preview.service';
import * as schema from '../db/schema';
import { PG_CONNECTION } from '../constants';
import { getThemeManifest, googleFontHead } from '../themes/theme-manifest-loader';
import { buildTokensCss } from '../themes/tokens-css';
import { migrateRevisionData } from '../utils/revision-migrations';

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

    const blocks = this.extractPageBlocks(
      loaded.data,
      page,
      loaded.publicUrl,
      loaded.themeId,
      siteId,
      productIdOverride,
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
      });
      res.type('text/html').send(html);
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

  private async loadRevisionData(siteId: string): Promise<{
    data: Record<string, unknown>;
    publicUrl: string | null;
    themeId: string | null;
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
      data: migrateRevisionData(rev.data as Record<string, unknown>),
      publicUrl: site.publicUrl ?? null,
      themeId: site.themeId ?? null,
    };
  }

  private extractPageBlocks(
    data: Record<string, unknown>,
    page: string,
    publicUrl: string | null,
    themeId: string | null,
    siteId: string,
    productIdOverride?: string,
  ): Array<{ type: string; props: Record<string, unknown> }> | null {
    const pagesData = (data.pagesData ?? {}) as Record<string, unknown>;
    // Resolve page key with fallback variants. Constructor sends page-product,
    // page-checkout (with page- prefix), but live storefront keys some pages
    // bare (home, cart, account). Try both forms in order.
    const candidates = [
      page,
      page.startsWith('page-') ? page.slice('page-'.length) : `page-${page}`,
    ];
    let pageData: Record<string, unknown> | undefined;
    for (const key of candidates) {
      const found = pagesData[key];
      if (found && typeof found === 'object') {
        pageData = found as Record<string, unknown>;
        break;
      }
    }
    if (!pageData) return null;
    const raw = pageData.content;
    let parsed: unknown;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw);
      } catch {
        return null;
      }
    } else {
      parsed = raw;
    }
    if (!Array.isArray(parsed)) return null;

    const manifest = themeId ? getThemeManifest(themeId) : null;
    const themeBlocks = manifest?.blocks ?? {};

    return parsed
      .filter(
        (b): b is { type: string; props: Record<string, unknown> } =>
          !!b &&
          typeof b === 'object' &&
          typeof (b as { type?: unknown }).type === 'string',
      )
      .map((b) => {
        const props = adaptLegacyProps(
          (b.props ?? {}) as Record<string, unknown>,
          publicUrl,
          b.type,
        );
        // Theme-level block defaults fill gaps merchant hasn't overridden.
        // Currently: `variant` picks which base layout to render (Hero
        // overlay vs centered, PopularProducts with-subtitle vs plain).
        const themeCfg = themeBlocks[b.type];
        if (themeCfg && !('override' in themeCfg)) {
          const v = (themeCfg as { variant?: string }).variant;
          if (v && !props.variant) {
            props.variant = v;
          }
        }
        // Catalog block: inject siteId so the SSG shell can client-fetch
        // real products from the storefront API and mirror the live grid.
        if (b.type === 'Catalog') {
          props.siteId = siteId;
        }
        // Product block: same — inline JS in Product.astro fetches the chosen
        // (or first available) product from storefront-data?product=:id.
        // When the constructor navigates from a Catalog card click, productId
        // is provided as a query override and takes priority over Puck props.
        if (b.type === 'Product') {
          props.siteId = siteId;
          if (productIdOverride) {
            this.logger.log(
              `[preview] Product block: overriding productId ${props.productId} → ${productIdOverride}`,
            );
            props.productId = productIdOverride;
          }
        }
        return { type: b.type, props };
      });
  }

  private tokensCssFromSettings(
    data: Record<string, unknown>,
    themeId: string | null,
  ): string {
    return buildTokensCss(data.themeSettings, themeId);
  }

  private errorPage(message: string): string {
    const safe = message.replace(/[&<>]/g, (c) =>
      c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;',
    );
    return `<!DOCTYPE html><html><body style="font-family:system-ui;padding:24px;color:#666"><h1 style="margin:0 0 8px">Preview error</h1><p>${safe}</p></body></html>`;
  }
}

/**
 * Adapter: legacy site_revision props → theme-base Astro contract.
 *
 * Different blocks treat the same-looking legacy shape differently —
 * e.g. `heading: {text, size}` is a string in Hero/PopularProducts but
 * an object in Footer. A single global flatten would break one to fix the
 * other, so flattening lives in per-block coercers; the only cross-block
 * normalisation done here is asset-URL rewriting.
 *
 * Per-block coercers run AFTER the generic walk and clobber anything the
 * walk produced.
 *
 * TODO(078 Phase 2): back-fill site_revision rows with a one-off migration,
 * then delete this adapter.
 */
function adaptLegacyProps(
  props: Record<string, unknown>,
  publicUrl: string | null,
  blockType: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    out[k] = rewriteValueUrls(v, publicUrl);
  }
  switch (blockType) {
    case 'Hero':
      coerceHeroProps(out, publicUrl);
      break;
    case 'Header':
      coerceHeaderProps(out);
      break;
    case 'PopularProducts':
      coercePopularProductsProps(out);
      break;
    case 'ContactForm':
      coerceContactFormProps(out);
      break;
    case 'Collections':
      coerceCollectionsProps(out, publicUrl);
      break;
    case 'Footer':
      coerceFooterProps(out);
      break;
    case 'ImageWithText':
      coerceImageWithTextProps(out, publicUrl);
      break;
    case 'MainText':
      coerceMainTextProps(out);
      break;
    default:
      // Generic fallback for the 19 blocks without a hand-written coercer
      // (MainText, Newsletter, ImageWithText, Slideshow, MultiColumns,
      // MultiRows, CollapsibleSection, Gallery, Video, Publications,
      // Product, PromoBanner, CartSection, CheckoutSection, AuthModal,
      // CartDrawer, CheckoutLayout, CheckoutHeader, AccountLayout).
      // Any legacy `{text|content, size|enabled, ...}` envelope that
      // theme-base schemas expect as a flat string gets unwrapped so the
      // Astro template doesn't render "[object Object]".
      coerceGenericLegacyProps(out);
      break;
  }
  return out;
}

/**
 * Unwrap `{text|content, size|enabled}` envelopes across any field
 * including nested arrayFields. Leaves structural objects alone
 * (anything with keys other than text/content/size/enabled/alignment).
 *
 * Also flattens the legacy button envelope `{text, link|href}` to
 * `{text, href}` — matches what Hero's cta expects across other blocks
 * like ImageWithText / CollapsibleSection.
 *
 * colorScheme "scheme-N" strings are converted to numbers.
 */
function coerceGenericLegacyProps(out: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(out)) {
    out[k] = coerceLegacyValue(v);
  }
  if (typeof out.colorScheme === 'string') {
    out.colorScheme = coerceSchemeNumber(out.colorScheme);
  }
  if (typeof out.containerColorScheme === 'string') {
    out.containerColorScheme = coerceSchemeNumber(out.containerColorScheme);
  }
  if (typeof out.copyrightColorScheme === 'string') {
    out.copyrightColorScheme = coerceSchemeNumber(out.copyrightColorScheme);
  }
}

function coerceLegacyValue(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(coerceLegacyValue);
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj);

  // {text: "...", size?, enabled?, alignment?} → text
  if (
    typeof obj.text === 'string' &&
    keys.every((k) => ['text', 'size', 'enabled', 'alignment'].includes(k))
  ) {
    return obj.text;
  }
  // {content: "...", size?, enabled?} → content
  if (
    typeof obj.content === 'string' &&
    keys.every((k) => ['content', 'size', 'enabled', 'alignment'].includes(k))
  ) {
    return obj.content;
  }
  // {text, link, enabled?} → {text, href}
  if (
    typeof obj.text === 'string' &&
    typeof obj.link === 'string' &&
    keys.every((k) => ['text', 'link', 'enabled', 'href'].includes(k))
  ) {
    return { text: obj.text, href: obj.link };
  }
  // {text, link:{href}, enabled?} → {text, href}
  if (
    typeof obj.text === 'string' &&
    isPlainObject(obj.link) &&
    typeof (obj.link as Record<string, unknown>).href === 'string'
  ) {
    return {
      text: obj.text,
      href: String((obj.link as Record<string, unknown>).href),
    };
  }
  // Otherwise recurse — preserves structural objects (image{url,alt},
  // padding{top,bottom}, newsletter{...}, *Column{...}, etc.).
  const next: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(obj)) {
    next[k] = coerceLegacyValue(val);
  }
  return next;
}

function unwrapTextSize(
  v: unknown,
): { value: string; present: boolean } {
  if (typeof v === 'string') return { value: v, present: true };
  if (isPlainObject(v)) {
    const obj = v as Record<string, unknown>;
    if (typeof obj.text === 'string') return { value: obj.text, present: true };
    if (typeof obj.content === 'string')
      return { value: obj.content, present: true };
  }
  return { value: '', present: false };
}

function coerceSchemeNumber(v: unknown, fallback = 1): number {
  if (typeof v === 'number' && v >= 1 && v <= 4) return v;
  if (typeof v === 'string') {
    const m = /^scheme-(\d+)$/.exec(v);
    if (m) {
      const n = Number(m[1]);
      return n >= 1 && n <= 4 ? n : fallback;
    }
  }
  return fallback;
}

function coerceHeroProps(
  out: Record<string, unknown>,
  publicUrl: string | null,
): void {
  // heading {text,size} OR top-level heading string → title
  const heading = unwrapTextSize(out.heading);
  if (heading.present && !out.title) out.title = heading.value;
  // text {content,size} → subtitle
  const subtitle = unwrapTextSize(out.text);
  if (subtitle.present && !out.subtitle) out.subtitle = subtitle.value;
  // image: "/path.png" (string legacy) → {url, alt}
  if (typeof out.image === 'string' && out.image) {
    out.image = {
      url: rewriteAssetUrl(out.image as string, publicUrl),
      alt: '',
    };
  }
  // backgroundImage → image.url (older legacy)
  if (!out.image && typeof out.backgroundImage === 'string') {
    out.image = {
      url: rewriteAssetUrl(out.backgroundImage, publicUrl),
      alt: '',
    };
  }
  // primaryButton OR button {text, link:{href}} → cta{text, href}
  const legacyBtn =
    isPlainObject(out.primaryButton)
      ? (out.primaryButton as Record<string, unknown>)
      : isPlainObject(out.button)
        ? (out.button as Record<string, unknown>)
        : null;
  if (!out.cta && legacyBtn) {
    const href =
      typeof legacyBtn.href === 'string'
        ? legacyBtn.href
        : isPlainObject(legacyBtn.link) &&
            typeof (legacyBtn.link as Record<string, unknown>).href === 'string'
          ? String((legacyBtn.link as Record<string, unknown>).href)
          : '';
    out.cta = { text: String(legacyBtn.text ?? ''), href };
  }
  // Legacy `position` ('bottom-center', 'overlay') → variant hint. Only
  // set when we can derive meaning from it — leaving variant undefined
  // lets theme-manifest's block.variant default take effect (e.g. Rose
  // forces 'overlay' theme-wide).
  const position = String(out.position ?? '');
  const imagePosition = String(out.imagePosition ?? '');
  if (!out.variant) {
    if (imagePosition === 'fullscreen' || position.includes('overlay')) {
      out.variant = 'overlay';
    } else if (imagePosition === 'split' || position.includes('split')) {
      out.variant = 'split';
    } else if (position === 'left' || position === 'right' || position === 'center') {
      out.variant = 'overlay';
    }
    // else: leave undefined for theme manifest or Astro frontmatter default
  }
  out.colorScheme = coerceSchemeNumber(out.colorScheme);
  if (!out.padding) out.padding = { top: 80, bottom: 80 };
  if (typeof out.title !== 'string') out.title = '';
  if (typeof out.subtitle !== 'string') out.subtitle = '';
  if (!out.image) out.image = { url: '', alt: '' };
  if (!out.cta) out.cta = { text: '', href: '#' };
  // size: "small"|"medium"|"large" is preserved as-is.
  if (typeof out.size !== 'string') out.size = 'medium';
  // overlay: numeric 0-100. legacy overlayOpacity may be 0..1 float.
  if (typeof out.overlay !== 'number') {
    if (typeof out.overlayOpacity === 'number') {
      out.overlay = Math.round(out.overlayOpacity * 100);
    } else {
      out.overlay = 30;
    }
  }
}

function coerceHeaderProps(out: Record<string, unknown>): void {
  out.colorScheme = coerceSchemeNumber(out.colorScheme);
  out.menuColorScheme = coerceSchemeNumber(out.menuColorScheme);
  // actionButtons: legacy has "true"/"false" strings, theme-base wants boolean.
  if (isPlainObject(out.actionButtons)) {
    const ab = out.actionButtons as Record<string, unknown>;
    out.actionButtons = {
      showSearch: truthy(ab.showSearch),
      showCart: truthy(ab.showCart),
      showProfile: truthy(ab.showProfile),
    };
  } else {
    out.actionButtons = { showSearch: true, showCart: true, showProfile: true };
  }
  if (typeof out.siteTitle !== 'string') out.siteTitle = '';
  if (typeof out.logo !== 'string') out.logo = '';
  if (!Array.isArray(out.navigationLinks)) out.navigationLinks = [];
  if (!out.padding) out.padding = { top: 16, bottom: 16 };
  // logoPosition/stickiness/menuType — enums; accept legacy values verbatim.
}

function coercePopularProductsProps(out: Record<string, unknown>): void {
  const heading = unwrapTextSize(out.heading);
  out.heading = heading.present ? heading.value : 'Популярные товары';
  // subtitle legacy shape: {text} or {content} envelope OR flat string
  const subtitle = unwrapTextSize(out.text);
  if (subtitle.present) out.subtitle = subtitle.value;
  if (typeof out.subtitle !== 'string') out.subtitle = '';
  // productCard.columns → columns, legacy `cards` stays
  if (!out.columns && isPlainObject(out.productCard)) {
    const pc = out.productCard as Record<string, unknown>;
    if (typeof pc.columns === 'number') out.columns = pc.columns;
  }
  if (typeof out.cards !== 'number') out.cards = 4;
  if (typeof out.columns !== 'number') out.columns = 4;
  out.colorScheme = coerceSchemeNumber(out.colorScheme);
  if (!out.padding) out.padding = { top: 80, bottom: 80 };
}

function coerceContactFormProps(out: Record<string, unknown>): void {
  const heading = unwrapTextSize(out.heading);
  out.heading = heading.present ? heading.value : 'Связаться с нами';
  if (typeof out.description !== 'string') out.description = '';
  if (typeof out.buttonText !== 'string') out.buttonText = 'Отправить';
  if (!isPlainObject(out.fields)) {
    out.fields = {
      name: { enabled: true, required: true, label: 'Имя' },
      email: { enabled: true, required: true, label: 'Email' },
      phone: { enabled: false, required: false, label: 'Телефон' },
      message: { enabled: true, required: false, label: 'Сообщение' },
    };
  }
  out.colorScheme = coerceSchemeNumber(out.colorScheme);
  if (!out.padding) out.padding = { top: 80, bottom: 80 };
}

function coerceImageWithTextProps(
  out: Record<string, unknown>,
  publicUrl: string | null,
): void {
  // heading: {text, enabled} → flat string
  const h = unwrapTextSize(out.heading);
  if (h.present) out.heading = h.value;
  else if (typeof out.heading !== 'string') out.heading = '';
  // text: {content, enabled} → flat string
  const t = unwrapTextSize(out.text);
  if (t.present) out.text = t.value;
  else if (typeof out.text !== 'string') out.text = '';
  // image: "" (legacy) → undefined, so Astro renders placeholder SVG
  if (typeof out.image === 'string') {
    out.image = out.image
      ? { url: rewriteAssetUrl(out.image as string, publicUrl), alt: '' }
      : undefined;
  }
  // button: {link: "/about", text, enabled} → {href, text}
  if (isPlainObject(out.button)) {
    const b = out.button as Record<string, unknown>;
    const href =
      typeof b.href === 'string'
        ? b.href
        : typeof b.link === 'string'
          ? b.link
          : isPlainObject(b.link) &&
              typeof (b.link as Record<string, unknown>).href === 'string'
            ? String((b.link as Record<string, unknown>).href)
            : '#';
    out.button = { text: String(b.text ?? ''), href };
  }
  out.colorScheme = coerceSchemeNumber(out.colorScheme);
  // photoPosition: "left"|"right" → imagePosition
  if (!out.imagePosition) {
    const pp = typeof out.photoPosition === 'string' ? out.photoPosition : '';
    out.imagePosition = pp === 'right' ? 'right' : 'left';
  }
  if (!out.padding) out.padding = { top: 40, bottom: 40 };
}

function coerceMainTextProps(out: Record<string, unknown>): void {
  const h = unwrapTextSize(out.heading);
  if (h.present) out.heading = h.value;
  else if (typeof out.heading !== 'string') out.heading = '';
  const t = unwrapTextSize(out.text);
  if (t.present) out.text = t.value;
  else if (typeof out.text !== 'string') out.text = '';
  out.colorScheme = coerceSchemeNumber(out.colorScheme);
  if (!out.align) out.align = 'left';
  if (!out.padding) out.padding = { top: 40, bottom: 40 };
}

function coerceFooterProps(out: Record<string, unknown>): void {
  // Footer schema expects nested heading/text/newsletter, which is what the
  // legacy data already has. The only mismatches are scalar colour schemes
  // and missing defaults.
  out.colorScheme = coerceSchemeNumber(out.colorScheme);
  out.copyrightColorScheme = coerceSchemeNumber(out.copyrightColorScheme);
  if (!isPlainObject(out.heading)) {
    out.heading = { text: '', size: 'small', alignment: 'center' };
  } else {
    const h = out.heading as Record<string, unknown>;
    if (typeof h.alignment !== 'string') h.alignment = 'center';
  }
  if (!isPlainObject(out.text)) {
    out.text = { content: '', size: 'small' };
  }
  // newsletter.enabled may be "true"/"false" string
  if (isPlainObject(out.newsletter)) {
    const n = out.newsletter as Record<string, unknown>;
    n.enabled = truthy(n.enabled);
  }
  // copyright.showYear may be string "true"/"false"
  if (isPlainObject(out.copyright)) {
    const c = out.copyright as Record<string, unknown>;
    c.showYear = truthy(c.showYear);
  }
  if (!out.padding) out.padding = { top: 80, bottom: 80 };
}

function truthy(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v === 'true' || v === '1';
  if (typeof v === 'number') return v !== 0;
  return false;
}

/**
 * Generic pass: rewrite asset URLs inside props. Does NOT flatten any
 * shape — per-block coercers handle that.
 */
function rewriteValueUrls(v: unknown, publicUrl: string | null): unknown {
  if (typeof v === 'string') return rewriteAssetUrl(v, publicUrl);
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => rewriteValueUrls(x, publicUrl));
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    out[k] = rewriteValueUrls(val, publicUrl);
  }
  return out;
}

/**
 * Legacy Collections block used `{title, subtitle, columnsCount, colorScheme:"scheme-N",
 * collections:[{name, image, hidden}]}`; theme-base's Collections expects
 * `{heading, columns, colorScheme:N, collections:[{id, collectionId, heading, image}]}`.
 * Coerce in place so the Astro template receives valid props.
 */
function coerceCollectionsProps(
  out: Record<string, unknown>,
  publicUrl: string | null,
): void {
  if (typeof out.title === 'string' && !out.heading) {
    out.heading = out.title;
  }
  if (typeof out.subtitle !== 'string') out.subtitle = '';
  if (typeof out.columnsCount === 'number' && !out.columns) {
    out.columns = out.columnsCount;
  }
  if (typeof out.colorScheme === 'string') {
    const m = /^scheme-(\d+)$/.exec(out.colorScheme);
    out.colorScheme = m ? Number(m[1]) : 1;
  }
  if (Array.isArray(out.collections)) {
    out.collections = out.collections
      .map((item, i) => {
        if (!isPlainObject(item)) return null;
        const raw = item as Record<string, unknown>;
        if (raw.hidden === true) return null;
        const heading = String(raw.heading ?? raw.name ?? '');
        const imageSrc = raw.image
          ? rewriteAssetUrl(String(raw.image), publicUrl)
          : undefined;
        const id = String(raw.id ?? `col-${i + 1}`);
        const result: Record<string, unknown> = {
          id,
          collectionId:
            typeof raw.collectionId === 'string' ? raw.collectionId : null,
          heading,
        };
        if (typeof raw.description === 'string') {
          result.description = raw.description;
        }
        if (imageSrc) result.image = imageSrc;
        return result;
      })
      .filter((x): x is Record<string, unknown> => x !== null);
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// buildTokensCss + scheme helpers moved to `src/themes/tokens-css.ts` so the
// live build pipeline (`src/generator/assemble-from-packages.ts`) can call the
// same generator. Guarantees preview iframe ↔ live site parity.

/**
 * Convert `#RRGGBB` or `#RGB` into `R G B` (space-separated decimals) so
 * it can be consumed as `rgb(var(--color-bg))` in component CSS. Returns
 * null for invalid / missing input so callers can skip emitting the var.
 */
function hexToRgbTriple(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const hex = v.trim().replace(/^#/, '');
  if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(hex)) return null;
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

const ASSET_EXT_RE = /\.(svg|png|jpe?g|gif|webp|avif|ico|mp4|webm|pdf)$/i;

/**
 * Rewrite a site-relative asset path (`/logo.svg`, `/uploads/hero.png`) to
 * the site's publicUrl so the iframe fetches from the live nginx instead of
 * `gateway.merfy.ru` (which doesn't serve these files and returns 404).
 *
 * Heuristic: only paths that START with `/` (but not `//`, not absolute
 * URLs) AND end in a recognised asset extension get rewritten. Navigation
 * hrefs like `/catalog` or `/about` stay untouched.
 */
function rewriteAssetUrl(url: string, publicUrl: string | null): string {
  if (!publicUrl) return url;
  if (!url.startsWith('/')) return url;
  if (url.startsWith('//')) return url;
  if (!ASSET_EXT_RE.test(url)) return url;
  const origin = publicUrl.replace(/\/$/, '');
  return origin + url;
}

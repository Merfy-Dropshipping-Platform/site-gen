import { Controller, Get, Inject, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { PreviewService } from '../services/preview.service';
import * as schema from '../db/schema';
import { PG_CONNECTION } from '../constants';
import { getThemeManifest } from '../themes/theme-manifest-loader';

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
  constructor(
    private readonly preview: PreviewService,
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  @Get()
  async getPreview(
    @Param('id') siteId: string,
    @Query('page') page: string = 'home',
    @Res() res: Response,
  ): Promise<void> {
    const loaded = await this.loadRevisionData(siteId);
    if (!loaded) {
      res
        .status(404)
        .type('text/html')
        .send(this.errorPage(`Site ${siteId} has no active revision`));
      return;
    }

    const blocks = this.extractPageBlocks(loaded.data, page, loaded.publicUrl);
    if (!blocks) {
      res
        .status(404)
        .type('text/html')
        .send(this.errorPage(`Page "${page}" not found in site ${siteId}`));
      return;
    }

    const html = await this.preview.renderPreviewPage({
      blocks,
      tokensCss: this.tokensCssFromSettings(loaded.data, loaded.themeId),
      fontHead: '',
    });
    res.type('text/html').send(html);
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
      data: rev.data as Record<string, unknown>,
      publicUrl: site.publicUrl ?? null,
      themeId: site.themeId ?? null,
    };
  }

  private extractPageBlocks(
    data: Record<string, unknown>,
    page: string,
    publicUrl: string | null,
  ): Array<{ type: string; props: Record<string, unknown> }> | null {
    const pagesData = (data.pagesData ?? {}) as Record<string, unknown>;
    const pageData = pagesData[page] as Record<string, unknown> | undefined;
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
    return parsed
      .filter(
        (b): b is { type: string; props: Record<string, unknown> } =>
          !!b &&
          typeof b === 'object' &&
          typeof (b as { type?: unknown }).type === 'string',
      )
      .map((b) => ({
        type: b.type,
        props: adaptLegacyProps(
          (b.props ?? {}) as Record<string, unknown>,
          publicUrl,
          b.type,
        ),
      }));
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
    // MainText / Newsletter / ImageWithText / Publications / Slideshow /
    // MultiColumns / MultiRows / CollapsibleSection / Gallery / Video /
    // PromoBanner / Product / CartSection / CheckoutSection / AuthModal /
    // CartDrawer / CheckoutLayout / CheckoutHeader / AccountLayout —
    // covered only by the generic URL rewrite for now; add coercers as
    // blocks start getting exercised by real revisions.
  }
  return out;
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
  // backgroundImage → image.url
  if (!out.image && typeof out.backgroundImage === 'string') {
    out.image = {
      url: rewriteAssetUrl(out.backgroundImage, publicUrl),
      alt: '',
    };
  }
  // primaryButton{text, link:{href}} → cta{text, href}
  if (!out.cta && isPlainObject(out.primaryButton)) {
    const b = out.primaryButton as Record<string, unknown>;
    const href =
      typeof b.href === 'string'
        ? b.href
        : isPlainObject(b.link) &&
            typeof (b.link as Record<string, unknown>).href === 'string'
          ? String((b.link as Record<string, unknown>).href)
          : '';
    out.cta = { text: String(b.text ?? ''), href };
  }
  // position|alignment|size|container → variant
  const position = String(out.position ?? '');
  if (!out.variant) {
    if (position.includes('bottom') || position.includes('overlay')) {
      out.variant = 'overlay';
    } else if (position.includes('split')) {
      out.variant = 'split';
    } else {
      out.variant = 'centered';
    }
  }
  out.colorScheme = coerceSchemeNumber(out.colorScheme);
  if (!out.padding) out.padding = { top: 80, bottom: 80 };
  if (typeof out.title !== 'string') out.title = '';
  if (typeof out.subtitle !== 'string') out.subtitle = '';
  if (!out.image) out.image = { url: '', alt: '' };
  if (!out.cta) out.cta = { text: '', href: '#' };
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

/**
 * Convert `data.themeSettings` into the CSS custom-property bundle theme-base
 * blocks expect. Blocks reference colours through `rgb(var(--color-*))` so
 * each hex value must be emitted as a space-separated R G B triple.
 *
 * Scheme scoping: blocks stamp `color-scheme-scheme-<N>` on their root
 * element (see Hero.astro et al). Output one rule per scheme plus a :root
 * block with radii / fonts / sizes that don't vary per scheme.
 *
 * Defaults (when themeSettings is missing) mirror the Phase 0 constants
 * so downstream rendering never sees undefined vars.
 */
function buildTokensCss(settings: unknown, themeId: string | null): string {
  const manifest = themeId ? getThemeManifest(themeId) : null;
  const s = isPlainObject(settings) ? settings : {};
  const buttonRadius = toPx(s.buttonRadius, 0);
  const cardRadius = toPx(s.cardRadius, 8);
  const inputRadius = toPx(s.inputRadius, 8);
  const mediaRadius = toPx(s.mediaRadius, 8);
  const fieldRadius = toPx(s.fieldRadius, 4);
  const headingFont = fontFamily(s.headingFont, 'system-ui');
  const bodyFont = fontFamily(s.bodyFont, 'system-ui');
  const sectionPadding = typeof s.sectionPadding === 'number'
    ? `${s.sectionPadding}px`
    : '80px';
  const bodyWeight = typeof s.bodyWeight === 'number' ? s.bodyWeight : 400;
  const headingWeight =
    typeof s.headingWeight === 'number' ? s.headingWeight : 400;
  const logoWidth = toPx(s.logoWidth, 40);
  const errorColor = hexToRgbTriple(s.errorColor) ?? '252 165 165';

  // Theme manifest defaults (Bitter/Arsenal for Rose, Urbanist/Inter for
  // Bloom, Kelly Slab/Arsenal for Satin, Roboto Flex for Flux, Bitter/
  // Arsenal for Vanilla) sit between BASE_DEFAULTS and merchant overrides.
  // If a merchant hasn't touched a font/radius in ThemeSettings, we fall
  // back to the theme's default. If they have, their value wins.
  const themeDefaults = (manifest?.defaults ?? {}) as Record<string, string>;
  const pick = (
    themeKey: string,
    merchantValue: string | undefined,
    hardcoded: string,
  ): string =>
    merchantValue !== undefined && merchantValue !== ''
      ? merchantValue
      : (themeDefaults[themeKey] ?? hardcoded);

  const merchantDidSetFontHeading =
    typeof s.headingFont === 'string' && s.headingFont !== '';
  const merchantDidSetFontBody =
    typeof s.bodyFont === 'string' && s.bodyFont !== '';

  const rootRules = `
:root {
  --radius-button: ${pick('--radius-button', undefined, buttonRadius)};
  --radius-card: ${pick('--radius-card', undefined, cardRadius)};
  --radius-input: ${pick('--radius-input', undefined, inputRadius)};
  --radius-media: ${pick('--radius-media', undefined, mediaRadius)};
  --radius-field: ${pick('--radius-field', undefined, fieldRadius)};
  --font-heading: ${merchantDidSetFontHeading ? headingFont : (themeDefaults['--font-heading'] ?? headingFont)};
  --font-body: ${merchantDidSetFontBody ? bodyFont : (themeDefaults['--font-body'] ?? bodyFont)};
  --weight-body: ${themeDefaults['--weight-body'] ?? bodyWeight};
  --weight-heading: ${themeDefaults['--weight-heading'] ?? headingWeight};
  --section-padding: ${pick('--spacing-section-y', undefined, sectionPadding)};
  --spacing-section-y: ${pick('--spacing-section-y', undefined, sectionPadding)};
  --spacing-grid-col-gap: ${themeDefaults['--spacing-grid-col-gap'] ?? '24px'};
  --spacing-grid-row-gap: ${themeDefaults['--spacing-grid-row-gap'] ?? '32px'};
  --size-hero-heading: ${themeDefaults['--size-hero-heading'] ?? '48px'};
  --size-hero-button-h: ${themeDefaults['--size-hero-button-h'] ?? '48px'};
  --size-nav-link: ${themeDefaults['--size-nav-link'] ?? '14px'};
  --size-logo-width: ${pick('--size-logo-width', undefined, logoWidth)};
  --size-newsletter-form-w: ${themeDefaults['--size-newsletter-form-w'] ?? '420px'};
  --container-max-width: ${themeDefaults['--container-max-width'] ?? '1320px'};
  --color-error: ${errorColor};
  --color-muted: 156 163 175;
  --color-primary: 17 17 17;
}`;

  // Merchant schemes win; theme manifest schemes fill the gap for IDs the
  // merchant hasn't touched. Theme schemes use the {id, name, tokens:{...}}
  // shape (RGB triples already baked in); merchant schemes use the legacy
  // hex-based {background, surfaceBg, heading, primaryButton:{...}} shape
  // and go through buildSchemeRule + hexToRgbTriple.
  const merchantSchemes = Array.isArray(s.colorSchemes) ? s.colorSchemes : [];
  const merchantById = new Map<string, Record<string, unknown>>();
  for (const raw of merchantSchemes) {
    if (isPlainObject(raw) && typeof (raw as Record<string, unknown>).id === 'string') {
      merchantById.set(
        String((raw as Record<string, unknown>).id),
        raw as Record<string, unknown>,
      );
    }
  }
  const themeSchemes = manifest?.colorSchemes ?? [];
  const themeSchemeIds = new Set(themeSchemes.map((t) => t.id));

  const schemeRuleLines: string[] = [];
  // Theme schemes first — one block each, merchant override takes precedence
  // but keeps the same scheme id so blocks stamped `color-scheme-scheme-N`
  // get consistent vars across schemes that only exist in one source.
  for (const themeScheme of themeSchemes) {
    const merchant = merchantById.get(themeScheme.id);
    if (merchant) {
      const rule = buildSchemeRule(merchant);
      if (rule) schemeRuleLines.push(rule);
      merchantById.delete(themeScheme.id);
    } else {
      schemeRuleLines.push(buildThemeSchemeRule(themeScheme));
    }
  }
  // Merchant-only schemes (id not present in manifest) — append as-is.
  for (const remaining of merchantById.values()) {
    const rule = buildSchemeRule(remaining);
    if (rule) schemeRuleLines.push(rule);
  }
  const schemeRules = schemeRuleLines.filter((r) => r.length > 0).join('\n');

  // Default scheme lookup: prefer merchant.defaultSchemeIndex, else fall
  // back to theme manifest's first scheme, else first available.
  const schemes: Record<string, unknown>[] = [
    ...merchantSchemes.filter(isPlainObject) as Record<string, unknown>[],
    ...themeSchemes.map((ts) => themeSchemeToMerchantShape(ts)),
  ];
  void themeSchemeIds; // reserved for future per-theme filter

  // Root also gets the default scheme's vars so blocks without an explicit
  // `color-scheme-scheme-N` class (shouldn't happen, but defensive) still
  // render legibly.
  const defaultIdx =
    typeof s.defaultSchemeIndex === 'number' ? s.defaultSchemeIndex : 1;
  const defaultScheme = isPlainObject(schemes[defaultIdx])
    ? (schemes[defaultIdx] as Record<string, unknown>)
    : isPlainObject(schemes[0])
      ? (schemes[0] as Record<string, unknown>)
      : null;
  const rootColorRules = defaultScheme
    ? schemeVarsInRoot(defaultScheme)
    : '';

  return [rootRules, rootColorRules, schemeRules].filter(Boolean).join('\n');
}

function toPx(v: unknown, fallback: number): string {
  return `${typeof v === 'number' ? v : fallback}px`;
}

function fontFamily(v: unknown, fallback: string): string {
  if (typeof v !== 'string' || !v) return fallback;
  // Known keys → real font stacks (matches existing font loader convention).
  const known: Record<string, string> = {
    comfortaa: '"Comfortaa", system-ui, sans-serif',
    manrope: '"Manrope", system-ui, sans-serif',
    inter: '"Inter", system-ui, sans-serif',
    'playfair-display': '"Playfair Display", Georgia, serif',
    roboto: '"Roboto", system-ui, sans-serif',
  };
  return known[v] ?? `"${v}", ${fallback}`;
}

/**
 * Theme-manifest scheme format already has RGB-triple values in its
 * `tokens` map. We emit them straight into a `.color-scheme-<id>` block —
 * no hex → rgb conversion needed.
 */
function buildThemeSchemeRule(scheme: {
  id: string;
  tokens: Record<string, string>;
}): string {
  const pairs = Object.entries(scheme.tokens).map(
    ([k, v]) => `${k}: ${v}`,
  );
  if (pairs.length === 0) return '';
  return `.color-scheme-${scheme.id} { ${pairs.join('; ')}; }`;
}

/**
 * Convert a theme-manifest scheme ({id, name, tokens: {--color-bg: "255 255 255"...}})
 * into the merchant-shape ({id, background: "#ffffff", ...}) so default-scheme
 * :root injection picks up theme defaults when the merchant hasn't touched a scheme.
 */
function themeSchemeToMerchantShape(scheme: {
  id: string;
  name: string;
  tokens: Record<string, string>;
}): Record<string, unknown> {
  const t = scheme.tokens;
  const rgbTripleToHex = (v: string | undefined): string | undefined => {
    if (typeof v !== 'string') return undefined;
    const parts = v.trim().split(/\s+/).map((n) => parseInt(n, 10));
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return undefined;
    const [r, g, b] = parts;
    return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
  };
  return {
    id: scheme.id,
    name: scheme.name,
    background: rgbTripleToHex(t['--color-bg']),
    surfaceBg: rgbTripleToHex(t['--color-surface']),
    heading: rgbTripleToHex(t['--color-heading']),
    text: rgbTripleToHex(t['--color-text']),
    primaryButton: {
      background: rgbTripleToHex(t['--color-button-bg']),
      text: rgbTripleToHex(t['--color-button-text']),
      border: rgbTripleToHex(t['--color-button-border']),
    },
    secondaryButton: {
      background: rgbTripleToHex(t['--color-button-2-bg']),
      text: rgbTripleToHex(t['--color-button-2-text']),
      border: rgbTripleToHex(t['--color-button-2-border']),
    },
  };
}

function buildSchemeRule(scheme: Record<string, unknown>): string {
  const id = typeof scheme.id === 'string' ? scheme.id : '';
  if (!id) return '';
  const vars = schemeToVars(scheme);
  if (!vars) return '';
  return `.color-scheme-${id} {${vars}}`;
}

function schemeVarsInRoot(scheme: Record<string, unknown>): string {
  const vars = schemeToVars(scheme);
  return vars ? `:root {${vars}}` : '';
}

function schemeToVars(scheme: Record<string, unknown>): string {
  const bg = hexToRgbTriple(scheme.background);
  const surface = hexToRgbTriple(scheme.surfaceBg);
  const heading = hexToRgbTriple(scheme.heading);
  const text = hexToRgbTriple(scheme.text);
  const primary = isPlainObject(scheme.primaryButton)
    ? (scheme.primaryButton as Record<string, unknown>)
    : {};
  const secondary = isPlainObject(scheme.secondaryButton)
    ? (scheme.secondaryButton as Record<string, unknown>)
    : {};

  const parts: string[] = [];
  if (bg) parts.push(`--color-bg: ${bg}`);
  if (surface) {
    parts.push(`--color-bg-alt: ${surface}`);
    // theme-base .classes.ts files read `--color-surface` (not bg-alt) —
    // emit both until the block classes are renamed in Phase 2.
    parts.push(`--color-surface: ${surface}`);
  }
  if (heading) parts.push(`--color-heading: ${heading}`);
  if (text) parts.push(`--color-text: ${text}`);
  const primaryBg = hexToRgbTriple(primary.background);
  const primaryText = hexToRgbTriple(primary.text);
  const primaryBorder = hexToRgbTriple(primary.border);
  if (primaryBg) parts.push(`--color-button-bg: ${primaryBg}`);
  if (primaryText) parts.push(`--color-button-text: ${primaryText}`);
  if (primaryBorder) parts.push(`--color-button-border: ${primaryBorder}`);
  const secondaryBg = hexToRgbTriple(secondary.background);
  const secondaryText = hexToRgbTriple(secondary.text);
  if (secondaryBg) parts.push(`--color-button-secondary-bg: ${secondaryBg}`);
  if (secondaryText) {
    parts.push(`--color-button-secondary-text: ${secondaryText}`);
  }

  return parts.length > 0 ? ' ' + parts.join('; ') + ';' : '';
}

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

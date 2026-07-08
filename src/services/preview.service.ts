import { Injectable, Optional } from '@nestjs/common';
import { rewriteHtmlAssets } from '../themes/asset-resolver';
import { composeV2Page, schemeIdFromProp } from '../themes/v2-page-composer';
import { previewTokensCssWithFonts } from '../themes/tokens-css';
import { IDIOMORPH_INLINE } from '../common/idiomorph-inline';

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPE_MAP[c]!);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * 095: deep-merge theme blockDefaults UNDER revision props. Plain objects
 * recurse; arrays/scalars in props replace wholesale. Used so a revision
 * like `newsletter: { enabled: true }` still inherits theme.json defaults
 * for `newsletter.heading` / `.description` / `.placeholder`.
 */
export function deepMergeBlockProps(
  defaults: Record<string, unknown>,
  props: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...defaults };
  for (const [key, value] of Object.entries(props)) {
    const defaultValue = defaults[key];
    if (isPlainObject(defaultValue) && isPlainObject(value)) {
      out[key] = deepMergeBlockProps(defaultValue, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Input for rendering a single block to HTML.
 */
export interface RenderBlockInput {
  blockName: string;
  props: Record<string, unknown>;
  /**
   * Theme id whose packages/theme-<id>/blocks/<blockName>/ should win if it
   * ships an override. When omitted (or set to 'base') resolver skips straight
   * to theme-base.
   */
  themeId?: string | null;
  /**
   * Context flag для graceful stub rendering (spec 092 Q3 C).
   * - true (preview iframe): show visible stub при missing/broken block
   * - false (live build): show invisible empty fragment
   */
  isPreview?: boolean;
}

/**
 * Input for rendering a full preview page (doctype + head + blocks + nav agent).
 */
export interface RenderPreviewPageInput {
  blocks: Array<{ type: string; props: Record<string, unknown> }>;
  tokensCss: string;
  fontHead: string;
  themeId?: string | null;
  /** Page key (e.g. 'home', 'checkout', 'cart'). Determines slot-based layout. */
  page?: string;
  /** Site ID — инжектится в превью (shopId, __MERFY_SITE_ID__, __MERFY_THEME__). */
  siteId?: string;
  /**
   * Site publicUrl — преview iframe должен fetch'ить static assets
   * (/icons/*.svg в CSS mask-image) с live site origin, потому что
   * customize.merfy.ru их не имеет. Inject'им CSS-var overrides в head.
   */
  publicUrl?: string | null;
}

/**
 * Minimal shape of the Astro Container API we depend on. Kept as a structural
 * type so tests can stub it without pulling in the real Astro runtime (which
 * cannot parse .astro files in ts-jest).
 */
export interface IAstroContainer {
  renderToString(
    component: unknown,
    opts?: { props?: Record<string, unknown> },
  ): Promise<string>;
}

/**
 * Resolves a block name to an Astro component module default export.
 * In production this dynamically imports from the right packages/theme-<id>/
 * override if one exists, falling back to @merfy/theme-base. Tests inject a
 * stub to avoid parsing .astro.
 */
export type ComponentResolver = (
  blockName: string,
  themeId?: string | null,
) => Promise<unknown>;

/**
 * Factory that creates an Astro container. In production this calls
 * `experimental_AstroContainer.create()` from `astro/container`. In tests
 * callers override this to return a stub container.
 */
export type ContainerFactory = () => Promise<IAstroContainer>;

/**
 * Default component resolver: dynamic-imports the precompiled block module
 * produced by `pnpm build:blocks` (see scripts/compile-astro-blocks.mjs).
 *
 * Expected output layout (flat, under dist/astro-blocks/):
 *   <pkg>__<blockName>__<fileName>.mjs
 * e.g. `theme-base__Hero__Hero.mjs`
 *
 * Phase 0: only theme-base is searched. Phase 1 will add theme cascade
 * (theme-<name> ?? theme-base).
 */
/**
 * v2 theme section resolver. Reads dist/theme-sections/<themeId>/manifest.json
 * (built by scripts/compile-theme-sections.mjs — verbatim верстка верстальщика
 * + import-граф) and dynamic-imports the section .mjs. Returns null when the
 * manifest/section is absent → legacy theme-base cascade takes over.
 */
async function resolveV2Section(
  blockName: string,
  themeId: string,
): Promise<unknown | null> {
  try {
    const { resolve } = await import('node:path');
    const { readFile } = await import('node:fs/promises');
    const dir = resolve(process.cwd(), 'dist', 'theme-sections', themeId);
    const manifest = JSON.parse(
      await readFile(resolve(dir, 'manifest.json'), 'utf-8'),
    ) as Record<string, string>;
    const file = manifest[blockName];
    if (!file) return null;
    const mod = (await import(resolve(dir, file))) as { default?: unknown };
    return mod.default ?? null;
  } catch {
    return null;
  }
}

const defaultComponentResolver: ComponentResolver = async (
  blockName,
  themeId,
) => {
  // v2 themes: секция компилится в dist/theme-sections/<themeId>/. Gated
  // манифестом — legacy-темы (cascade ниже) не задеваются.
  if (themeId && themeId !== 'base') {
    const v2 = await resolveV2Section(blockName, themeId);
    if (v2) return v2;
  }

  // Cascade theme-<id> override → theme-base. Skip the override tier for
  // themeId 'base' or when none is provided.
  const packages: string[] = [];
  if (themeId && themeId !== 'base') packages.push(`theme-${themeId}`);
  packages.push('theme-base');

  const { resolve } = await import('node:path');
  const roots = [
    resolve(process.cwd(), 'dist', 'astro-blocks'),
    resolve(
      process.cwd(),
      'backend',
      'services',
      'sites',
      'dist',
      'astro-blocks',
    ),
  ];

  let lastErr: unknown;
  const allErrors: string[] = [];
  for (const pkg of packages) {
    const moduleName = `${pkg}__${blockName}__${blockName}.mjs`;
    for (const root of roots) {
      const p = resolve(root, moduleName);
      try {
        const mod = (await import(p)) as { default?: unknown };
        if (mod.default) return mod.default;
        throw new Error(`Compiled module ${moduleName} has no default export`);
      } catch (err) {
        lastErr = err;
        const e = err as Error;
        allErrors.push(`${p}: ${e?.message?.slice(0, 200) ?? String(err).slice(0, 200)}`);
      }
    }
  }

  // Diagnostics: when block is missing, list the directories the resolver
  // checked. Helps catch deploys where build:blocks succeeded in the
  // builder stage but the dist/astro-blocks/ folder didn't make it into
  // the runtime image (cache, COPY ordering, etc).
  const fs = await import('node:fs');
  const diag: string[] = [];
  for (const root of roots) {
    try {
      const entries = fs.readdirSync(root);
      // Filter to entries matching the requested blockName so we can see
      // exactly which files for THIS block are present (rather than just
      // a generic count).
      const matching = entries.filter((e) => e.includes(`__${blockName}__`));
      diag.push(
        `${root}: [${entries.length} entries] matching "${blockName}": [${matching.join(', ') || 'NONE'}]`,
      );
    } catch (e) {
      diag.push(`${root}: NOT-EXIST (${(e as NodeJS.ErrnoException).code ?? 'unknown'})`);
    }
  }

  throw new Error(
    `Block "${blockName}" not resolvable for themeId="${themeId ?? 'base'}". ` +
      `Run 'pnpm build:blocks' first. ALL errors: [${allErrors.join(' || ')}]. ` +
      `Filesystem diagnostics: ${diag.join(' | ')}`,
  );
};

/**
 * Default container factory. In production calls Astro's experimental
 * Container API. We import it lazily to avoid loading Astro in jest unless
 * the production path is actually hit.
 *
 * The specifier is built at runtime (via a variable) so ts-jest's type
 * resolver doesn't try to locate the module at test time — sites' tsconfig
 * uses `moduleResolution: node` which doesn't read Astro's package exports
 * map. At Node runtime the ESM resolver DOES read the exports map, so this
 * works in production.
 */
const defaultContainerFactory: ContainerFactory = async () => {
  const specifier = 'astro/container';
  const mod = (await import(/* @vite-ignore */ specifier)) as {
    experimental_AstroContainer: { create(): Promise<IAstroContainer> };
  };
  const container = await mod.experimental_AstroContainer.create();
  return container;
};

@Injectable()
export class PreviewService {
  private container: IAstroContainer | null = null;
  private readonly containerFactory: ContainerFactory;
  private readonly componentResolver: ComponentResolver;

  constructor(
    @Optional() containerFactory?: ContainerFactory,
    @Optional() componentResolver?: ComponentResolver,
  ) {
    this.containerFactory = containerFactory ?? defaultContainerFactory;
    this.componentResolver = componentResolver ?? defaultComponentResolver;
  }

  private async getContainer(): Promise<IAstroContainer> {
    if (!this.container) {
      this.container = await this.containerFactory();
    }
    return this.container;
  }

  /**
   * Render a single named block to an HTML string. Theme-level blockDefaults
   * (from theme.json) merged UNDER user props so preview ≡ live build:
   * if revision не задаёт `Header.variant`, but theme.json has
   * `blockDefaults.Header.variant: 'two-tier'` — preview покажет two-tier
   * (mirror page-generator.ts:122).
   */
  async renderBlock(input: RenderBlockInput): Promise<string> {
    const isPreview = input.isPreview ?? true;
    try {
      const Component = await this.componentResolver(
        input.blockName,
        input.themeId ?? null,
      );
      const themeDefaults = await this.loadThemeBlockDefaults(input.themeId);
      const blockDefaults = (themeDefaults[input.blockName] as Record<string, unknown> | undefined) ?? {};
      // 095: deep-merge so blockDefaults sub-keys (e.g. Footer.newsletter.heading,
      // description, placeholder) survive when revision has partial sub-object
      // like `newsletter: { enabled: true }`. Arrays are replaced wholesale.
      const mergedProps = deepMergeBlockProps(blockDefaults, (input.props ?? {}) as Record<string, unknown>);
      const container = await this.getContainer();
      const html = await container.renderToString(Component, {
        props: mergedProps,
      });
      return html;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isMissing = /Cannot find module|not resolvable|MODULE_NOT_FOUND/.test(msg);
      if (isPreview) {
        const escaped = escapeHtml(input.blockName);
        if (isMissing) {
          return `<div data-missing-block="${escaped}" style="padding:24px;background:#fef3c7;border:2px dashed #d97706;color:#92400e;text-align:center;font-family:sans-serif;border-radius:8px;margin:16px 0">Блок «${escaped}» не настроен. Удалите его или обратитесь в поддержку.</div>`;
        }
        return `<div data-render-error="${escaped}" style="padding:16px;background:#fee2e2;border:1px solid #dc2626;color:#991b1b;font-family:sans-serif;border-radius:8px;margin:16px 0">Ошибка рендера блока «${escaped}»</div>`;
      }
      // Live build — invisible (spec 092 Q3 C)
      return '';
    }
  }

  /**
   * Схема блока для обёртки .color-scheme-N: props ревизии побеждают,
   * иначе blockDefaults темы (та же семантика merge, что у renderBlock).
   */
  async resolveBlockScheme(
    blockName: string,
    props: Record<string, unknown> | undefined,
    themeId: string | null,
  ): Promise<string | null> {
    const fromProps = schemeIdFromProp(props?.colorScheme);
    if (fromProps) return fromProps;
    const defaults = await this.loadThemeBlockDefaults(themeId);
    const blockDefaults = defaults[blockName] as Record<string, unknown> | undefined;
    return schemeIdFromProp(blockDefaults?.colorScheme);
  }

  private themeDefaultsCache = new Map<string, Record<string, unknown>>();

  /**
   * Read `blockDefaults` from `packages/theme-<id>/theme.json` (cached). Returns
   * empty object if theme.json missing or has no blockDefaults section.
   */
  private async loadThemeBlockDefaults(
    themeId: string | null | undefined,
  ): Promise<Record<string, unknown>> {
    const id = themeId ?? 'base';
    const cached = this.themeDefaultsCache.get(id);
    if (cached) return cached;
    try {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const themeJsonPath = path.join(
        process.cwd(),
        'packages',
        `theme-${id}`,
        'theme.json',
      );
      const raw = await fs.readFile(themeJsonPath, 'utf8');
      const parsed = JSON.parse(raw) as { blockDefaults?: Record<string, unknown> };
      const defaults = parsed.blockDefaults ?? {};
      this.themeDefaultsCache.set(id, defaults);
      return defaults;
    } catch {
      this.themeDefaultsCache.set(id, {});
      return {};
    }
  }

  /**
   * Constructor v2 (Phase 1) — load the FULLY-BUILT theme page produced by
   * ThemeBuildService into `dist/theme-preview/<themeName>/index.html`.
   *
   * When present, the constructor preview returns this whole assembled page
   * verbatim (the верстальщик's theme as-is) instead of the legacy per-block
   * render. Strictly gated on file existence: returns the HTML string when the
   * file is found, or `null` so the caller falls back to the legacy path 1:1.
   *
   * Path resolution mirrors `loadThemeCss()` (dist/theme-css/<id>.css): same
   * dist base resolved at runtime (`__dirname` → ../../theme-preview, and
   * process.cwd()/dist/theme-preview). The only extra step is the theme-key
   * gotcha — `templateId` may carry a version suffix (`rose-1.0`, `rose@2`)
   * while A1 writes the dir under the bare theme name (`rose`). We try the id
   * as-is first, then the base name (`templateId.replace(/[-@].*$/, '')`).
   *
   * Cached per templateId (incl. negative results as '') so repeated preview
   * loads don't re-stat/re-read the file — same memoisation shape as
   * `loadThemeCss()`.
   */
  async tryLoadBuiltThemeHtml(
    templateId: string | null | undefined,
    route?: string,
  ): Promise<string | null> {
    if (!templateId) return null;
    // Cache is keyed per (templateId, route) — each Astro route emits its own
    // <route>/index.html, so different pages must not clobber each other.
    const cacheKey = `${templateId}::${route ?? ''}`;
    const cached = PreviewService._builtThemeHtmlCache.get(cacheKey);
    if (cached !== undefined) return cached === '' ? null : cached;

    const { readFile } = await import('node:fs/promises');
    const { resolve } = await import('node:path');

    // Route → relative file. Root (empty/undefined route) is index.html;
    // a named route loads <route>/index.html (about/index.html, cart/...).
    const rel = route && route !== '' ? `${route}/index.html` : 'index.html';

    // Theme-key candidates: id as-is, then base name without version suffix.
    // Order matters — exact match wins over the stripped fallback.
    const baseKey = PreviewService.bareThemeKey(templateId);
    const keyCandidates =
      baseKey && baseKey !== templateId ? [templateId, baseKey] : [templateId];

    // Dist-base candidates mirror loadThemeCss(): compiled file lives at
    // dist/src/services/preview.service.js, so ../../theme-preview hits
    // dist/theme-preview; the cwd-based path covers process-root invocations.
    for (const key of keyCandidates) {
      const fileCandidates = [
        resolve(__dirname, '..', '..', 'theme-preview', key, rel),
        resolve(process.cwd(), 'dist', 'theme-preview', key, rel),
      ];
      for (const p of fileCandidates) {
        try {
          const html = await readFile(p, 'utf-8');
          PreviewService._builtThemeHtmlCache.set(cacheKey, html);
          return html;
        } catch {
          // try next candidate
        }
      }
    }

    // Negative cache: no built page for this (theme, route) → legacy path.
    PreviewService._builtThemeHtmlCache.set(cacheKey, '');
    return null;
  }

  // Per-(templateId, route) cache for tryLoadBuiltThemeHtml. '' encodes a
  // negative result (file absent) so we don't re-stat on every preview load.
  private static readonly _builtThemeHtmlCache = new Map<string, string>();

  /** Кэш per-themeKey: есть ли скомпилированные v2-секции (manifest.json). */
  private static readonly _v2SectionsCache = new Map<string, boolean>();

  /** Bare-ключ темы как в tryLoadBuiltThemeHtml: 'rose-1.0' → 'rose'. */
  static bareThemeKey(templateId: string): string {
    return templateId.replace(/[-@].*$/, '');
  }

  async hasV2Sections(templateId: string | null | undefined): Promise<boolean> {
    if (!templateId) return false;
    const key = PreviewService.bareThemeKey(templateId);
    const cached = PreviewService._v2SectionsCache.get(key);
    if (cached !== undefined) return cached;
    const { access } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    const candidates = [
      resolve(__dirname, '..', '..', 'theme-sections', key, 'manifest.json'),
      resolve(process.cwd(), 'dist', 'theme-sections', key, 'manifest.json'),
    ];
    let found = false;
    for (const p of candidates) {
      try {
        await access(p);
        found = true;
        break;
      } catch {
        /* next */
      }
    }
    PreviewService._v2SectionsCache.set(key, found);
    return found;
  }

  /**
   * Фаза 2: контентная страница v2-темы = шелл собранной страницы темы
   * + Container-рендер блоков ревизии + iframe-агент конструктора.
   * Возвращает null, если шелл не найден/не распознан — зовущий фоллбечит
   * на существующий блоб-путь 1:1.
   */
  async renderV2ContentPage(input: {
    themeId: string;
    route: string;
    blocks: Array<{ type: string; props: Record<string, unknown> }>;
    titleOverride?: string;
    /** Site ID — инжектится в пропсы секций для SSR-фетча реальных данных
     *  (выбранная коллекция → реальные товары прямо в статике превью). */
    siteId?: string;
    /** revision.data.themeSettings — для tokens.css (паритет с live). */
    themeSettings?: unknown;
  }): Promise<string | null> {
    const shellHtml =
      (await this.tryLoadBuiltThemeHtml(input.themeId, input.route)) ??
      (await this.tryLoadBuiltThemeHtml(input.themeId, ''));
    if (!shellHtml) return null;
    const blocksHtml = await Promise.all(
      input.blocks.map((b) =>
        this.renderBlock({ blockName: b.type, props: { ...b.props, siteId: (b.props as Record<string, unknown>)?.siteId ?? input.siteId }, themeId: input.themeId }),
      ),
    );
    const composed = composeV2Page({
      shellHtml,
      blocksHtml,
      blockTypes: input.blocks.map((b) => b.type),
      blockSchemes: await Promise.all(input.blocks.map((b) => this.resolveBlockScheme(b.type, b.props, input.themeId))),
      assetPrefix: `/__theme/${PreviewService.bareThemeKey(input.themeId)}`,
      titleOverride: input.titleOverride,
      tokensCss: previewTokensCssWithFonts(input.themeSettings ?? {}, PreviewService.bareThemeKey(input.themeId)),
    });
    if (composed === null) return null;
    // Агент конструктора (select/hot-replace/postMessage) — то, чего
    // блоб-пути не хватало для выделения секций. Вставка по ПОСЛЕДНЕМУ
    // </body>: литерал внутри инлайн-скрипта хвоста не должен поймать агента.
    const bodyClose = composed.lastIndexOf('</body>');
    if (bodyClose === -1) return null;
    return (
      composed.slice(0, bodyClose) +
      `${IDIOMORPH_INLINE}<script>${PREVIEW_NAV_AGENT_INLINE}</script>` +
      composed.slice(bodyClose)
    );
  }

  /**
   * Инжектит агента конструктора (hover/select/postMessage) перед последним
   * </body>. Нужен для БЛОБ-пути (product/catalog/cart/checkout), который отдаёт
   * built-theme HTML напрямую (tryLoadBuiltThemeHtml) и без этого НЕ имел
   * интерактива выделения секций — ни ховера, ни клика, ни правой панели.
   * Идемпотентно: на секционном пути агента уже вставил renderV2ContentPage,
   * поэтому при наличии маркера STYLE_ID повторно не добавляем (иначе двойные
   * слушатели → двойные postMessage).
   */
  injectNavAgent(html: string): string {
    if (html.includes('__merfy_preview_overlay_styles')) return html;
    const bodyClose = html.lastIndexOf('</body>');
    if (bodyClose === -1) return html;
    return (
      html.slice(0, bodyClose) +
      `${IDIOMORPH_INLINE}<script>${PREVIEW_NAV_AGENT_INLINE}</script>` +
      html.slice(bodyClose)
    );
  }

  /**
   * Constructor v2 (Phase 1, Task 3) — resolve the product page's preview route.
   *
   * The product page's slug is `/product`, but the theme builds per-product
   * pages at dist/theme-preview/<key>/products/<id>/index.html (one dir per
   * product). The preview can only serve a concrete product, so this returns
   * `products/<firstDir>` for the first built product (alphabetically, since
   * readdir is sorted below) or `null` when no product pages are built.
   *
   * Theme-key resolution mirrors tryLoadBuiltThemeHtml (id as-is, then base
   * name without version suffix). Cached per templateId (incl. negative '').
   */
  async firstBuiltProductRoute(
    templateId: string | null | undefined,
  ): Promise<string | null> {
    if (!templateId) return null;
    const cached = PreviewService._firstProductRouteCache.get(templateId);
    if (cached !== undefined) return cached === '' ? null : cached;

    const { readdir } = await import('node:fs/promises');
    const { resolve } = await import('node:path');

    const baseKey = PreviewService.bareThemeKey(templateId);
    const keyCandidates =
      baseKey && baseKey !== templateId ? [templateId, baseKey] : [templateId];

    for (const key of keyCandidates) {
      const dirCandidates = [
        resolve(__dirname, '..', '..', 'theme-preview', key, 'products'),
        resolve(process.cwd(), 'dist', 'theme-preview', key, 'products'),
      ];
      for (const dir of dirCandidates) {
        try {
          const entries = await readdir(dir, { withFileTypes: true });
          const first = entries
            .filter((e) => e.isDirectory())
            .map((e) => e.name)
            .sort()[0];
          if (first) {
            const route = `products/${first}`;
            PreviewService._firstProductRouteCache.set(templateId, route);
            return route;
          }
        } catch {
          // try next candidate
        }
      }
    }

    // Negative cache: no built product pages for this theme.
    PreviewService._firstProductRouteCache.set(templateId, '');
    return null;
  }

  // Per-templateId cache for firstBuiltProductRoute. '' = negative result.
  private static readonly _firstProductRouteCache = new Map<string, string>();

  /**
   * Render a full preview page: doctype, head (fontHead + tokens.css),
   * each block's HTML, and the preview nav agent installer.
   */
  async renderPreviewPage(input: RenderPreviewPageInput): Promise<string> {
    const pageKey = input.page ?? 'home';
    // Все страницы (home/cart/etc.) рендерятся через ОДНУ generic pipeline.
    // Checkout — единственное исключение: его 2-column layout (form/summary)
    // структурно не выразить через generic sequential rendering. После
    // sequential render оборачиваем CheckoutForm + CheckoutSummary в
    // 2-col grid (post-processing). Иначе preview не соответствует live
    // (live template уже wrap'ит в grid).
    const isLegacyCheckout =
      (pageKey === 'checkout' || pageKey === 'page-checkout') &&
      input.blocks.some((b) => b.type === 'CheckoutLayout') &&
      !input.blocks.some((b) => b.type === 'CheckoutForm');
    const isMegaCheckout =
      (pageKey === 'checkout' || pageKey === 'page-checkout') &&
      input.blocks.some((b) => b.type === 'CheckoutForm') &&
      input.blocks.some((b) => b.type === 'CheckoutSummary');

    let bodyHtml: string;
    if (isLegacyCheckout) {
      bodyHtml = await this.renderCheckoutLayout(input);
    } else {
      // NB: preview.controller.ts уже делает per-block asset URL rewriting
      // через `adaptLegacyProps` → `rewriteValueUrls`. Не дублируем здесь.
      // Safety net на HTML output (rewriteHtmlAssets ниже) ловит build-time
      // hardcoded paths в .astro / runtime JS.
      // Parallel render: Astro `experimental_AstroContainer.renderToString`
      // is safe to call concurrently on a shared container instance.
      const renderedBlocks = await Promise.all(
        input.blocks.map(async (b) => {
          const html = await this.renderBlock({
            blockName: b.type,
            props: { ...b.props, siteId: (b.props as Record<string, unknown>)?.siteId ?? input.siteId },
            themeId: input.themeId ?? null,
          });
          const schemeId = schemeIdFromProp(b.props?.colorScheme);
          // Header sticky: display:contents убирает бокс обёртки схемы, чтобы
          // containing block inner sticky-дива был <body> (иначе хедер заперт
          // в коротком родителе и не липнет). См. page-generator.ts.
          const wrapStyle = b.type === 'Header' ? ` style="display:contents"` : '';
          const wrapped = schemeId
            ? `<div class="color-scheme-${schemeId}"${wrapStyle} data-block-scheme="${schemeId}">${html}</div>`
            : html;
          return { type: b.type, wrapped };
        }),
      );

      if (isMegaCheckout) {
        // Walk blocks: всё ДО CheckoutForm — sequential, CheckoutForm +
        // CheckoutSummary — в 2-col grid, всё ПОСЛЕ CheckoutSummary —
        // sequential (Footer).
        const parts: string[] = [];
        let formHtml = '';
        let summaryHtml = '';
        for (const { type, wrapped } of renderedBlocks) {
          if (type === 'CheckoutForm') {
            formHtml = wrapped;
          } else if (type === 'CheckoutSummary') {
            summaryHtml = wrapped;
          } else if (formHtml && summaryHtml) {
            // After grid pair found — push grid then continue with this block
            parts.push(this.wrapCheckoutGrid(formHtml, summaryHtml));
            formHtml = '';
            summaryHtml = '';
            parts.push(wrapped);
          } else {
            parts.push(wrapped);
          }
        }
        if (formHtml && summaryHtml) {
          parts.push(this.wrapCheckoutGrid(formHtml, summaryHtml));
        } else if (formHtml) {
          parts.push(formHtml);
        } else if (summaryHtml) {
          parts.push(summaryHtml);
        }
        bodyHtml = parts.join('\n');
      } else {
        bodyHtml = renderedBlocks.map((b) => b.wrapped).join('\n');
      }
    }

    const previewTailwind = await loadPreviewTailwindCss();
    const themeCss = await loadThemeCss(input.themeId ?? null);

    // Safety net для **hardcoded** absolute-paths в скомпилированном HTML
    // (placeholder PNGs из `.astro`, runtime JS innerHTML). Основной путь
    // — resolveAssetUrls(props) выше — превращает merchant-data ссылки в
    // абсолютные ДО рендера. Это закрывает оставшийся build-time hardcode.
    bodyHtml = rewriteHtmlAssets(bodyHtml, input.publicUrl);

    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Preview</title>
  ${input.fontHead}
  <style>${previewTailwind}</style>
  <style id="__merfy_theme_css">${themeCss}</style>
  <style id="__merfy_tokens_css">${input.tokensCss}</style>
  ${input.publicUrl ? `<style id="__merfy_asset_overrides">:root{
    --header-icon-cart:url('${input.publicUrl.replace(/\/$/, '')}/icons/cart.svg');
    --header-icon-user:url('${input.publicUrl.replace(/\/$/, '')}/icons/user.svg');
    --header-icon-search:url('${input.publicUrl.replace(/\/$/, '')}/icons/search-lg.svg');
    --header-icon-burger:url('${input.publicUrl.replace(/\/$/, '')}/icons/menu-burger.svg');
  }</style>` : ''}
</head>
<body>
  ${bodyHtml}
  <script>
    // НЕ клоббер: injectPreviewGlobals может выставить __MERFY_CONFIG__.checkout
    // ДО этого скрипта (head) — создаём объект при отсутствии и лишь дозаполняем
    // shopId/apiUrl, сохраняя .checkout.
    window.__MERFY_CONFIG__ = window.__MERFY_CONFIG__ || {};
    if (!window.__MERFY_CONFIG__.shopId) window.__MERFY_CONFIG__.shopId = ${JSON.stringify(input.siteId ?? '')};
    if (!window.__MERFY_CONFIG__.apiUrl) window.__MERFY_CONFIG__.apiUrl = 'https://gateway.merfy.ru/api';
    ${process.env.DADATA_API_KEY ? `window.__DADATA_TOKEN__ = ${JSON.stringify(process.env.DADATA_API_KEY)};` : ''}
  </script>
  ${IDIOMORPH_INLINE}
  <script>${PREVIEW_NAV_AGENT_INLINE}</script>
</body>
</html>`;
  }

  /**
   * Wrap CheckoutForm + CheckoutSummary в 2-column grid div per Figma 1:19998.
   * Form 434px / Summary 589px / gap 56px / left-pad 200px on desktop.
   * Mobile: stacked grid-cols-1, no left padding.
   */
  private wrapCheckoutGrid(formHtml: string, summaryHtml: string): string {
    // Inline styles — Tailwind preview-pipeline не сканирует src/services/*.ts
    // → arbitrary classes (grid-cols-[434px_589px]) не попадают в bundle.
    // Inline CSS работает независимо. Mobile: <1024px stacked + side pad 16.
    const gridStyle = [
      'max-width:1280px',
      'margin:0 auto',
      'padding:48px 16px',
      'display:grid',
      'grid-template-columns:1fr',
      'gap:32px',
    ].join(';');
    const mediaQuery = `
      @media (min-width: 1024px) {
        [data-checkout-grid] {
          padding: 48px 24px !important;
          grid-template-columns: minmax(0,1fr) minmax(0,1fr) !important;
          column-gap: 32px !important;
          row-gap: 32px !important;
        }
      }
      @media (min-width: 1280px) {
        [data-checkout-grid] {
          padding: 48px 0 48px 200px !important;
          grid-template-columns: 434px 589px !important;
          column-gap: 56px !important;
          row-gap: 32px !important;
        }
      }
    `;
    return `<style>${mediaQuery}</style><div data-checkout-grid style="${gridStyle}"><div data-checkout-column="form" style="min-width:0">${formHtml}</div><div data-checkout-column="summary" style="min-width:0">${summaryHtml}</div></div>`;
  }

  /**
   * Mirror /checkout.astro: header → summary toggle → 2-column grid via
   * CheckoutLayout (form column on left, summary column on right). Wraps in
   * .color-scheme-2 because Figma 1:13398 says checkout always renders light.
   */
  private async renderCheckoutLayout(
    input: RenderPreviewPageInput,
  ): Promise<string> {
    const formSlotTypes = new Set([
      'CheckoutContactForm',
      'CheckoutDeliveryForm',
      'CheckoutDeliveryMethod',
      'CheckoutPayment',
      'CheckoutSubmit',
      'CheckoutTerms',
    ]);
    const summarySlotTypes = new Set([
      'CheckoutOrderSummary',
      'CheckoutTotals',
    ]);

    const themeId = input.themeId ?? null;
    const headerBlock = input.blocks.find((b) => b.type === 'CheckoutHeader');
    const summaryToggleBlock = input.blocks.find(
      (b) => b.type === 'CheckoutSummaryToggle',
    );
    const layoutBlock = input.blocks.find((b) => b.type === 'CheckoutLayout');
    const formBlocks = input.blocks.filter((b) => formSlotTypes.has(b.type));
    const summaryBlocks = input.blocks.filter((b) =>
      summarySlotTypes.has(b.type),
    );

    // Figma 1:19998 — new mega-block structure: CheckoutForm + CheckoutSummary.
    const megaFormBlock = input.blocks.find((b) => b.type === 'CheckoutForm');
    const megaSummaryBlock = input.blocks.find((b) => b.type === 'CheckoutSummary');

    const renderOne = async (b: { type: string; props: Record<string, unknown> }) =>
      this.renderBlock({ blockName: b.type, props: b.props, themeId });

    const headerHtml = headerBlock ? await renderOne(headerBlock) : '';
    const toggleHtml = summaryToggleBlock
      ? await renderOne(summaryToggleBlock)
      : '';

    // New 2-mega-block path (Figma 1:19998) — preferred when блоки есть.
    if (megaFormBlock && megaSummaryBlock) {
      const [formHtml, summaryHtml] = await Promise.all([
        renderOne(megaFormBlock),
        renderOne(megaSummaryBlock),
      ]);
      return `<div class="color-scheme-2">${headerHtml}<main class="flex-1 w-full" style="background: rgb(var(--color-bg)); color: rgb(var(--color-text));"><div class="mx-auto max-w-[var(--container-max-width)] px-4 py-16 grid grid-cols-1 lg:grid-cols-[652px_884px] gap-x-16 gap-y-8 justify-center"><div data-checkout-column="form">${formHtml}</div><div data-checkout-column="summary">${summaryHtml}</div></div></main></div>`;
    }

    const formInnerParts = await Promise.all(formBlocks.map(renderOne));
    const summaryInnerParts = await Promise.all(summaryBlocks.map(renderOne));

    if (layoutBlock) {
      // Render CheckoutLayout shell with named slots. We can't use Astro's
      // <slot> here (we're outside the Astro component), so we render the
      // block then string-replace its slot placeholders.
      const shell = await this.renderBlock({
        blockName: 'CheckoutLayout',
        props: layoutBlock.props,
        themeId,
      });
      const formInner = formInnerParts.join('');
      const summaryInner = summaryInnerParts.join('');
      // Astro Container renders <slot name="X" /> as a self-closing
      // placeholder when there's no fragment. Inject by slot name.
      // CheckoutLayout uses data-checkout-column="form|summary" as the slot
      // markers (one for each column div). Inject rendered form/summary
      // blocks into them.
      const withSlots = shell
        .replace(
          /(<[^<>]+data-checkout-column="form"[^<>]*>)([\s\S]*?)(<\/div>)/i,
          (_m, open, _inner, close) => `${open}${formInner}${close}`,
        )
        .replace(
          /(<[^<>]+data-checkout-column="summary"[^<>]*>)([\s\S]*?)(<\/div>)/i,
          (_m, open, _inner, close) => `${open}${summaryInner}${close}`,
        );
      return `<div class="color-scheme-2">${headerHtml}<main class="flex-1 w-full" style="background: rgb(var(--color-bg)); color: rgb(var(--color-text));">${toggleHtml}${withSlots}</main></div>`;
    }

    // No CheckoutLayout configured — fall back to linear column.
    const linearInner = [...formInnerParts, ...summaryInnerParts].join('');
    return `<div class="color-scheme-2">${headerHtml}<main class="flex-1 w-full" style="background: rgb(var(--color-bg)); color: rgb(var(--color-text));">${toggleHtml}<div class="mx-auto max-w-[var(--container-max-width)] px-4 flex flex-col gap-6">${linearInner}</div></main></div>`;
  }
}

/**
 * Read the precompiled Tailwind bundle from disk once per process. Built
 * by scripts/compile-preview-tailwind.mjs during the Docker image build;
 * location is dist/preview-tailwind.css relative to the sites service
 * root. Returns an empty string if the file is missing so renders don't
 * crash — they just fall back to unstyled (same behaviour as before this
 * hook existed).
 */
let _cachedPreviewTailwind: string | null = null;
async function loadPreviewTailwindCss(): Promise<string> {
  if (_cachedPreviewTailwind !== null) return _cachedPreviewTailwind;
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  // dist/src/services/preview.service.js → ../../preview-tailwind.css
  const candidates = [
    resolve(__dirname, '..', '..', 'preview-tailwind.css'),
    resolve(process.cwd(), 'dist', 'preview-tailwind.css'),
    resolve(
      process.cwd(),
      'backend',
      'services',
      'sites',
      'dist',
      'preview-tailwind.css',
    ),
  ];
  for (const p of candidates) {
    try {
      const css = await readFile(p, 'utf-8');
      _cachedPreviewTailwind = css;
      return css;
    } catch {
      // try next candidate
    }
  }
  _cachedPreviewTailwind = '';
  return '';
}

/**
 * Load compiled v2 theme CSS bundle (their global.css → Tailwind output) from
 * dist/theme-css/<themeId>.css (built by scripts/compile-theme-sections.mjs).
 * Cached per themeId; '' when absent (legacy themes have no bundle → no-op).
 */
const _cachedThemeCss = new Map<string, string>();
async function loadThemeCss(themeId: string | null): Promise<string> {
  if (!themeId) return '';
  const cached = _cachedThemeCss.get(themeId);
  if (cached !== undefined) return cached;
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const candidates = [
    resolve(__dirname, '..', '..', 'theme-css', `${themeId}.css`),
    resolve(process.cwd(), 'dist', 'theme-css', `${themeId}.css`),
  ];
  for (const p of candidates) {
    try {
      const css = await readFile(p, 'utf-8');
      _cachedThemeCss.set(themeId, css);
      return css;
    } catch {
      // try next candidate
    }
  }
  _cachedThemeCss.set(themeId, '');
  return '';
}

/**
 * Inline postMessage bridge for the constructor iframe. Sent as part of the
 * preview HTML instead of a separate `/runtime/preview-nav-agent.js` file —
 * (a) one fewer asset endpoint to wire through the gateway, (b) lives with
 * the HTML it augments, (c) no bundling step needed.
 *
 * Parent (constructor) contract — keep in sync with
 *   constructor/src/lib/postMessageProtocol.ts
 *
 *   iframe → parent:
 *     { type: 'ready' }
 *     { type: 'navigate',  path: string }
 *     { type: 'select-block', blockId: string }
 *     { type: 'form-submit-blocked', formId: string }
 *     { type: 'render-error', message: string }
 *   parent → iframe:
 *     { type: 'init', siteId, themeId, pageId, data }
 *     { type: 'update-block', blockId, props }
 *
 * Design notes:
 *  - postMessage origin is `*` for now; tightening it requires the parent to
 *    send the expected origin in `init`, out of scope for Phase 1c.
 *  - `select-block` reads `data-puck-component-id` which every Astro block
 *    in theme-base already stamps on its root element.
 *  - Forms are blocked (preventDefault) because the iframe runs inside the
 *    editor, not a live storefront — submitting would either 404 or trigger
 *    real orders. An empty `formId` falls back to the form's index.
 */

const PREVIEW_NAV_AGENT_INLINE = `
(function () {
  var TARGET = '*';
  function post(msg) { try { parent.postMessage(msg, TARGET); } catch (e) {} }

  // Pupa parity: hover/selected outlines + floating action pill (label + copy +
  // delete) for sections и подсекций. CSS инжектируется в head iframe, JS
  // toggle data-puck-*-hover/selected на mouseover/mouseleave/click. Parent
  // посылает set-selection при изменении Puck itemSelector / selectedArrayIndex
  // и set-labels при инициализации (componentLabels + subsectionItemLabels).
  var STYLE_ID = '__merfy_preview_overlay_styles';
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      // Pupa parity = Puck native DraggableComponent overlay.
      // hover: solid azure-09 (#cfdff0) + light azure-08 background tint.
      // selected: solid azure-07 (#88b0da).
      // НЕ перебиваем sticky Header: этот стиль инжектится appendChild'ом ПОЗЖЕ
      // previewTailwind, и [data-puck-component-id] (0,0,1,0) при равной специфичности
      // с .sticky выигрывал → «Статичность Всегда»/scroll-up не липли в превью (баг
      // тестера). Исключаем sticky-классом и inline-стилем (vanilla — inline).
      '[data-puck-component-id]:not(.sticky):not([style*="sticky"]){position:relative}',
      // Sticky-классы Header портов (themes/<тема>/Header.astro): preview-tailwind
      // scan НЕ подхватывает их в Docker (хотя @source добавлен) → .sticky/.top-0/
      // .z-50 отсутствовали в превью-CSS, и «Статичность» (класс есть, правила нет)
      // не работала в конструкторе. Инжектим явно — независимо от Tailwind-scan.
      '.sticky{position:sticky}',
      '.top-0{top:0}',
      '.z-50{z-index:50}',
      '.transition-transform{transition-property:transform;transition-timing-function:cubic-bezier(0.4,0,0.2,1);transition-duration:150ms}',
      '.duration-300{transition-duration:300ms}',
      // Логотип-картинка портов (themes/<тема>/Header.astro:
      // <img class="h-[var(--size-logo-width,Npx)] w-auto max-w-[160px] object-contain">).
      // preview-tailwind scan НЕ берёт классы theme-портов в Docker (как .sticky выше):
      // в превью-бандле нет height-вариантов ≠24px (bloom 19 / satin 22) и НЕТ max-width:160px
      // ни у кого → загруженное лого рендерится без ограничений = «на всю страницу».
      // Инжектим явно для всех тем. Атрибут-селектор ловит любой fallback px;
      // текстовый логотип (text-[length:var(--size-logo-width,…)]) не матчится.
      '[class*="h-[var(--size-logo-width"]{height:var(--size-logo-width,24px);width:auto;max-width:160px;object-fit:contain}',
      // NB: НЕ ставим z-index на section-hover/selected — это перебивает sticky
      // header z-50 → Hero z-10 поднимается выше Header → submenu panel недоступен.
      // Outline это border-like rendering, в z-stack не участвует.
      '[data-puck-section-hover="true"]{outline:2px solid #cfdff0 !important;outline-offset:-2px}',
      '[data-puck-section-hover="true"]::after{content:"";position:absolute;inset:0;background:rgba(171,199,229,0.3);pointer-events:none;z-index:0}',
      '[data-puck-section-selected="true"]{outline:2px solid #88b0da !important;outline-offset:-2px}',
      '[data-puck-subsection-parent]{position:relative;cursor:pointer}',
      '[data-puck-subsection-hover="true"]{outline:2px solid #cfdff0 !important;outline-offset:2px;z-index:3}',
      '[data-puck-subsection-hover="true"]::after{content:"";position:absolute;inset:0;background:rgba(171,199,229,0.3);pointer-events:none;z-index:0}',
      '[data-puck-subsection-selected="true"]{outline:2px solid #88b0da !important;outline-offset:2px;z-index:4}',
      // Puck ActionBar styling (1:1 with @measured/puck DraggableComponent action overlay).
      '.__merfy_pill{position:fixed;display:none;align-items:center;cursor:default;padding:4px;border-radius:8px;background:#181818;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.25);pointer-events:auto;z-index:9999;user-select:none;white-space:nowrap}',
      '.__merfy_pill[data-visible="true"]{display:inline-flex}',
      '.__merfy_pill_group{align-items:center;display:flex;height:100%;padding:0 4px}',
      '.__merfy_pill_group + .__merfy_pill_group{border-inline-start:0.5px solid #767676}',
      '.__merfy_pill_label{color:#c3c3c3;font-size:12px;font-weight:500;padding:0 8px;margin:0 4px;text-overflow:ellipsis;white-space:nowrap;line-height:1}',
      '.__merfy_pill_action{appearance:none;background:transparent;border:none;color:#c3c3c3;cursor:pointer;padding:6px 8px;margin:0 4px;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;transition:color .15s}',
      '.__merfy_pill_action:hover{color:#6499cf;transition:none}',
      '.__merfy_pill_action:active{color:#3479be;transition:none}',
      '.__merfy_pill_action svg{width:16px;height:16px;display:block;pointer-events:none}',
      // 106 systemic: скрытие хром-блоков (Header/Footer/PromoBanner вне <main>) —
      // reconcile тогглит data-rc-hidden. !important переживает inline
      // display:contents Header-обёртки (иначе сбил бы раскладку при показе).
      '[data-rc-hidden="1"]{display:none !important}'
    ].join('');
    document.head.appendChild(s);
  }
  injectStyles();

  function clearAttr(attr) {
    var els = document.querySelectorAll('[' + attr + ']');
    for (var i = 0; i < els.length; i++) els[i].removeAttribute(attr);
  }

  // Labels (filled by parent in 'init' / 'set-labels').
  var componentLabels = {};
  var subsectionItemLabels = {};
  // Hot-update context (filled by parent in 'init').
  // Used by 'update-block' handler для построения fetch URL и per-theme guard
  // (Rose делает hot-replace, другие темы fallback на полный iframe reload).
  var currentThemeId = '';
  var currentSiteId = '';

  // Spec 090 — local-patch state. Хранит последний known props per blockId
  // чтобы compute diff при следующем update-block.
  var LAST_PROPS = {};

  // 098-fix «блок исчез при правке слайдера»: монотонный порядок применения
  // hot-replace. Слайдер генерит серию update-block одного блока; ответы
  // через gateway могут вернуться НЕ по порядку (наблюдали очередь 5.5с) —
  // без guard'а stale-ответ перезаписывает свежий рендер. Каждому fetch
  // присваиваем seq; применяем только если он новее последнего применённого.
  var UPDATE_SEQ = {};
  var APPLIED_SEQ = {};

  // 106 reconcile: stash удалённых/скрытых body-секций (id → outerHTML) для
  // мгновенного показа без сети; RC_APPLIED_VERSION — stale-guard монотонной версии.
  var RC_STASH = {};
  var RC_APPLIED_VERSION = 0;
  // 106 US2 renderedPropsHash: какой propsHash сейчас отрисован/в stash для
  // блока. Совпал с дескриптором → reuse (живой узел/stash, без сети); изменился
  // (правка скрытой секции) или нет вовсе (новый блок) → server fetch.
  var RC_RENDERED_HASH = {};

  // 098-fix: валидация ответа /preview/block перед заменой DOM. Раньше тело
  // ЛЮБОГО ответа (JSON-ошибка gateway, 5xx-комментарий, SPA-шелл) вставлялось
  // как outerHTML/innerHTML — секция молча «исчезала». Теперь: парсим в
  // template и требуем корневой [data-puck-component-id] (для update — с тем
  // же blockId). Невалидный ответ → warn + старый DOM остаётся.
  function isValidBlockHtml(html, expectBlockId) {
    if (typeof html !== 'string' || !html.trim()) return false;
    try {
      var tpl = document.createElement('template');
      tpl.innerHTML = html;
      var sel = expectBlockId
        ? '[data-puck-component-id="' + expectBlockId + '"]'
        : '[data-puck-component-id]';
      return !!tpl.content.querySelector(sel);
    } catch (e) {
      return false;
    }
  }

  // 098 systemic: HTML5 spec — <script> elements added via innerHTML не выполняются.
  // После hot-replace на update-block hydration scripts (Catalog/Collections/
  // PopularProducts/Gallery/etc fetching real products) остаются inert,
  // placeholders видны вместо real cards. Воссоздаём <script> элементы вручную —
  // браузер их выполнит. Idempotency на стороне блока через data-X-hydrated attrs.
  function executeScriptsIn(rootEl) {
    if (!rootEl) return;
    var scripts = rootEl.querySelectorAll('script');
    for (var i = 0; i < scripts.length; i++) {
      var oldScript = scripts[i];
      var newScript = document.createElement('script');
      for (var j = 0; j < oldScript.attributes.length; j++) {
        var attr = oldScript.attributes[j];
        newScript.setAttribute(attr.name, attr.value);
      }
      newScript.text = oldScript.text;
      if (oldScript.parentNode) oldScript.parentNode.replaceChild(newScript, oldScript);
    }
    // Hoisted-скрипты v2-секций (инлайнит compile-theme-sections) выполняются
    // «один раз на страницу» (window-гард — зеркало кэша Astro-модулей по URL).
    // Ре-инициализация после hot-replace — стандартный сигнал Astro:
    // astro:page-load (его же шлёт ClientRouter после навигации; на него
    // подписаны hydratePopular/header-sync верстальщика и блоки theme-base
    // со своими data-hydrated гардами). Шлём ОБА события навигации Astro
    // (как ClientRouter): after-swap слушают scroll-анимации тем
    // (initScrollAnimations в Layout — без него вставленный hot-add контент
    // с data-animate остаётся opacity:0 «пустая секция»), page-load —
    // гидрация блоков (hydratePopular/header-sync).
    // 098-fix: trailing-коалесинг 60мс — пачка hot-replace (серия слайдера,
    // очередь gateway) даёт ОДНУ ре-инициализацию вместо N подряд; заодно
    // вставленные module-скрипты успевают самоинициализироваться (раньше 0мс).
    dispatchAstroNavEventsDebounced();
  }

  var __astroNavEventsTimer = null;
  function dispatchAstroNavEventsDebounced() {
    if (__astroNavEventsTimer) clearTimeout(__astroNavEventsTimer);
    __astroNavEventsTimer = setTimeout(function () {
      __astroNavEventsTimer = null;
      document.dispatchEvent(new Event('astro:after-swap'));
      document.dispatchEvent(new Event('astro:page-load'));
    }, 60);
  }

  // 106 reconcile helpers. idiomorph ключуется по id → зеркалим
  // data-puck-component-id→id на корнях body-секций (scheme-обёртку id-set
  // ловит по id вложенного блока).
  function __rcMirrorIds(container) {
    var els = container.querySelectorAll('[data-puck-component-id]');
    for (var i = 0; i < els.length; i++) {
      var bid = els[i].getAttribute('data-puck-component-id');
      if (bid && els[i].id !== bid) els[i].id = bid;
    }
  }
  // Прямой ребёнок container, который содержит/является блоком id (учёт scheme-обёртки).
  function __rcTopChild(id, container) {
    var el = container.querySelector('[data-puck-component-id="' + id + '"]');
    if (!el) return null;
    var node = el;
    while (node.parentElement && node.parentElement !== container) node = node.parentElement;
    return node.parentElement === container ? node : null;
  }
  // beforeNodeRemoved: складываем outerHTML удаляемой body-секции в stash
  // (мгновенный показ без сети). Только прямые дети main.
  function __rcStash(node, container) {
    if (!node || node.nodeType !== 1 || node.parentNode !== container) return;
    var idEl = node.hasAttribute('data-puck-component-id')
      ? node
      : node.querySelector('[data-puck-component-id]');
    if (!idEl) return;
    var bid = idEl.getAttribute('data-puck-component-id');
    if (bid) RC_STASH[bid] = node.outerHTML;
  }
  // afterNodeAdded: зеркалим id на вставленный блок + переисполняем inline-скрипты
  // (HTML5 не выполняет <script> при innerHTML/morph; гидрация идемпотентна на
  // стороне блока через data-*-hydrated / __merfyHydrated).
  function __rcAfterAdd(node) {
    if (!node || node.nodeType !== 1) return;
    var idEl = node.hasAttribute && node.hasAttribute('data-puck-component-id')
      ? node
      : (node.querySelector ? node.querySelector('[data-puck-component-id]') : null);
    if (idEl) {
      var bid = idEl.getAttribute('data-puck-component-id');
      if (bid && idEl.id !== bid) idEl.id = bid;
    }
    executeScriptsIn(node);
  }
  // 106 reconcile apply: morph <main> к собранному target-HTML body-секций +
  // CSS-toggle хрома (Header/Footer/PromoBanner вне main) + ack. Вынесено из
  // handler'а — US2-путь применяет асинхронно после fetch новых блоков, US1/US3
  // (hide/show/reorder/delete) — синхронно без сети.
  function __rcApply(rcVersion, rcTarget, rcMain, rcParts) {
    try {
      Idiomorph.morph(rcMain, rcParts.join(''), {
        morphStyle: 'innerHTML',
        callbacks: {
          // 110-fix: поддеревья с data-rc-preserve — клиент-управляемый контент
          // (список товаров корзины / тоггл пусто↔наполнено), которого НЕТ в SSR
          // (рендерится на клиенте из getCart()). Морф обновляет ТОЛЬКО обёртку
          // секции (padding/scheme), такой контент пропускает (return false) →
          // смена настроек реактивна (CSS-апдейт), товары не пересоздаются и не
          // мигают, состояние пусто/наполнено не сбрасывается в SSR-дефолт.
          beforeNodeMorphed: function (oldNode) {
            if (oldNode && oldNode.nodeType === 1 && oldNode.hasAttribute && oldNode.hasAttribute('data-rc-preserve')) return false;
            return true;
          },
          beforeNodeRemoved: function (n) { __rcStash(n, rcMain); },
          afterNodeAdded: function (n) { __rcAfterAdd(n); }
        }
      });
    } catch (rcErr) {
      console.error('[preview] reconcile morph failed', rcErr);
      post({ type: 'reconcile-ack', version: rcVersion, ok: false, applied: [], missing: rcTarget.map(function (b) { return b && b.id; }) });
      return;
    }
    RC_APPLIED_VERSION = rcVersion;
    // Хром (Header/Footer/PromoBanner вне <main>) — только hide/show (не reorder/
    // add/delete). Единый CSS-toggle по тому же видимому target: блок вне target →
    // скрыть (data-rc-hidden), в target → показать. Body-секции уже сведены morph.
    var rcVisible = {};
    for (var rvi = 0; rvi < rcTarget.length; rvi++) { if (rcTarget[rvi] && rcTarget[rvi].id) rcVisible[rcTarget[rvi].id] = 1; }
    var rcAll = document.querySelectorAll('[data-puck-component-id]');
    for (var rai = 0; rai < rcAll.length; rai++) {
      var rael = rcAll[rai];
      if (rcMain.contains(rael)) continue; // body-секции — уже morph
      var raid = rael.getAttribute('data-puck-component-id');
      if (!raid) continue;
      var ratop = rael; // top-level элемент хрома (scheme-обёртка = прямой ребёнок body)
      while (ratop.parentElement && ratop.parentElement !== document.body) ratop = ratop.parentElement;
      if (rcVisible[raid]) ratop.removeAttribute('data-rc-hidden');
      else ratop.setAttribute('data-rc-hidden', '1');
    }
    var rcFinal = [];
    var rcKids2 = rcMain.children;
    for (var rfi = 0; rfi < rcKids2.length; rfi++) {
      var rfEl = rcKids2[rfi];
      var rfIdEl = rfEl.hasAttribute('data-puck-component-id') ? rfEl : rfEl.querySelector('[data-puck-component-id]');
      if (rfIdEl) rcFinal.push(rfIdEl.getAttribute('data-puck-component-id'));
    }
    post({ type: 'reconcile-ack', version: rcVersion, ok: true, applied: rcFinal, missing: [] });
  }

  // Spec 090 — runtime kill switch. Можно выключить через console:
  // window.__MERFY_LOCAL_PATCH_ENABLED = false; reload не требуется.
  if (typeof window.__MERFY_LOCAL_PATCH_ENABLED === 'undefined') {
    window.__MERFY_LOCAL_PATCH_ENABLED = true;
  }

  // Spec 090 — LOCAL_PATCH_REGISTRY[blockType][propName] = (el, oldVal, newVal) => boolean.
  // Patch fn возвращает false → fallback на server fetch.
  var LOCAL_PATCH_REGISTRY = {
    Header: {
      padding: function (el, _oldVal, newVal) {
        var hdr = el.querySelector('header');
        if (!hdr) return false;
        var MAX_PAD = 120;
        var v = newVal || { top: 0, bottom: 0 };
        var t = Math.min(Number(v.top) || 0, MAX_PAD);
        var b = Math.min(Number(v.bottom) || 0, MAX_PAD);
        hdr.style.paddingTop = t + 'px';
        hdr.style.paddingBottom = b + 'px';
        return true;
      },
      colorScheme: function (el, _oldVal, newVal) {
        var wrap = el.closest('[data-header-wrapper]') || el;
        wrap.className = wrap.className.replace(/\bcolor-scheme-\d+\b/g, '').replace(/\s+/g, ' ').trim();
        if (typeof newVal === 'string' && newVal) {
          var n = newVal.replace('scheme-', '');
          wrap.classList.add('color-scheme-' + n);
        }
        return true;
      },
      menuColorScheme: function (el, _oldVal, newVal) {
        var items = el.querySelectorAll('[data-nav-inline]');
        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          it.className = it.className.replace(/\bcolor-scheme-\d+\b/g, '').replace(/\s+/g, ' ').trim();
          if (typeof newVal === 'string' && newVal) {
            var n = newVal.replace('scheme-', '');
            it.classList.add('color-scheme-' + n);
          }
        }
        return true;
      },
      stickiness: function (el, _oldVal, newVal) {
        var wrap = el.closest('[data-header-wrapper]') || el;
        wrap.className = wrap.className
          .replace(/sticky\s+top-0\s+z-50(\s+transition-transform\s+duration-300)?/g, '')
          .replace(/relative\s+z-50/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        var classToAdd = newVal === 'scroll-up' ? 'sticky top-0 z-50 transition-transform duration-300'
          : newVal === 'always' ? 'sticky top-0 z-50'
          : 'relative z-50';
        var parts = classToAdd.split(' ');
        for (var pi = 0; pi < parts.length; pi++) {
          if (parts[pi]) wrap.classList.add(parts[pi]);
        }
        // Некоторые темы (vanilla) задают sticky inline-стилем, а не классом —
        // class-замена выше их не трогает. Синхронизируем inline position, иначе
        // «Статичность» не применяется в превью для этих тем (баг тестера).
        if (newVal === 'always' || newVal === 'scroll-up') {
          wrap.style.position = 'sticky'; wrap.style.top = '0'; wrap.style.zIndex = '50';
        } else {
          wrap.style.position = ''; wrap.style.top = ''; wrap.style.zIndex = '';
        }
        // «При прокрутке вверх»: scroll-up JS (прятать при скролле вниз, показывать
        // при вверх) инжектится только при ПЕРВИЧНОМ рендере Header. При hot-смене
        // «Статичности» в превью его нет → заводим/снимаем listener здесь, иначе в
        // конструкторе scroll-up «не работает» (баг тестера vanilla+rose).
        if (window.__merfyScrollUp) {
          window.removeEventListener('scroll', window.__merfyScrollUp);
          window.__merfyScrollUp = null;
          wrap.style.transform = '';
        }
        if (newVal === 'scroll-up') {
          var lastY = window.scrollY;
          window.__merfyScrollUp = function () {
            var y = window.scrollY;
            if (y > lastY && y > wrap.offsetHeight) wrap.style.transform = 'translateY(-100%)';
            else wrap.style.transform = '';
            lastY = y;
          };
          window.addEventListener('scroll', window.__merfyScrollUp, { passive: true });
        }
        return true;
      },
      navigationLinks: function (el, oldVal, newVal) {
        var oa = Array.isArray(oldVal) ? oldVal : [];
        var na = Array.isArray(newVal) ? newVal : [];
        // Кол-во пунктов изменилось (добавили/удалили) → структурная правка,
        // надёжнее полный server fetch (newer DOM с правильным числом узлов).
        if (oa.length !== na.length) return false;
        // Есть подменю где-либо (или его размер изменился) → server fetch:
        // вложенные структуры (inline popup + drawer) патчить точечно рискованно,
        // полный ре-рендер надёжнее. Local-patch берём ТОЛЬКО для плоского меню.
        for (var i = 0; i < na.length; i++) {
          var oSub = (oa[i] && Array.isArray(oa[i].submenu)) ? oa[i].submenu : [];
          var nSub = (na[i] && Array.isArray(na[i].submenu)) ? na[i].submenu : [];
          if (oSub.length !== nSub.length) return false;
          if (nSub.length > 0) return false;
        }
        // Плоское меню: точечно правим label/href БЕЗ ре-рендера всего Header
        // (иначе sticky/drawer/скрипты перестраиваются на каждую букву и меню
        // мигает/пропадает). Обновляем ОБА представления меню, если они есть:
        // десктоп-inline (data-nav-inline) и шторку-drawer (data-nav-drawer,
        // напр. rose menuType=sidebar: видимое меню живёт в шторке, inline скрыт).
        var patched = false;
        // Десктоп inline: пункт = прямой a (без подменю) ИЛИ div > a (триггер).
        var inlineNav = el.querySelector('[data-nav-inline]');
        if (inlineNav) {
          var inlineLinks = inlineNav.querySelectorAll(':scope > a, :scope > div > a');
          if (inlineLinks.length !== na.length) return false;
          for (var j = 0; j < na.length; j++) {
            inlineLinks[j].textContent = na[j].label || '';
            inlineLinks[j].href = na[j].href || '/';
          }
          patched = true;
        }
        // Шторка drawer: пункт = <div> > <a> (первый <a> в каждой группе).
        var drawerNav = el.querySelector('[data-nav-drawer]');
        if (drawerNav) {
          var drawerLinks = drawerNav.querySelectorAll(':scope > div > a');
          if (drawerLinks.length !== na.length) return false;
          for (var d = 0; d < na.length; d++) {
            drawerLinks[d].textContent = na[d].label || '';
            drawerLinks[d].href = na[d].href || '/';
          }
          patched = true;
        }
        // Ни одного носителя меню не нашли (тема без маркеров) → server fetch.
        return patched;
      }
    },
    // 110 — корзина: отступы/схема патчатся ТОЧЕЧНО (без re-fetch/replace). Иначе
    // слайдер отступов перефетчивал блок и пересоздавал список товаров → сдвиг/моргание.
    // Меняем только padding/класс самой секции → реактивно, двигается лишь корзина.
    CartBody: {
      padding: function (el, _oldVal, newVal) {
        var v = newVal || { top: 0, bottom: 0 };
        el.style.paddingTop = Math.min(Number(v.top) || 0, 160) + 'px';
        el.style.paddingBottom = Math.min(Number(v.bottom) || 0, 160) + 'px';
        return true;
      },
      colorScheme: function (el, _oldVal, newVal) {
        el.className = el.className.replace(/\bcolor-scheme-\d+\b/g, '').replace(/\s+/g, ' ').trim();
        el.classList.add('color-scheme-' + String(newVal != null && newVal !== '' ? newVal : 2).replace('scheme-', ''));
        return true;
      }
    },
    CartSummary: {
      padding: function (el, _oldVal, newVal) {
        var v = newVal || { top: 0, bottom: 0 };
        el.style.paddingTop = Math.min(Number(v.top) || 0, 160) + 'px';
        el.style.paddingBottom = Math.min(Number(v.bottom) || 0, 160) + 'px';
        return true;
      },
      colorScheme: function (el, _oldVal, newVal) {
        el.className = el.className.replace(/\bcolor-scheme-\d+\b/g, '').replace(/\s+/g, ' ').trim();
        el.classList.add('color-scheme-' + String(newVal != null && newVal !== '' ? newVal : 2).replace('scheme-', ''));
        return true;
      }
    },
    // 091 — Hero local-patch: heading/text text changes БЕЗ outerHTML replace.
    // Это предотвращает re-load <img> при правке заголовка (картинка не «крашится»).
    // Size change → false (fallback на server fetch чтобы CSS класс пересчитался).
    Hero: {
      heading: function (el, oldVal, newVal) {
        var oldObj = (oldVal && typeof oldVal === 'object') ? oldVal : {};
        var newObj = (newVal && typeof newVal === 'object') ? newVal : {};
        if ((oldObj.size || 'small') !== (newObj.size || 'small')) return false;
        var h1 = el.querySelector('h1[data-puck-subsection-field="heading"]');
        if (!h1) return false;
        h1.textContent = newObj.text || '';
        return true;
      },
      text: function (el, oldVal, newVal) {
        var oldObj = (oldVal && typeof oldVal === 'object') ? oldVal : {};
        var newObj = (newVal && typeof newVal === 'object') ? newVal : {};
        if ((oldObj.size || 'small') !== (newObj.size || 'small')) return false;
        var p = el.querySelector('p[data-puck-subsection-field="text"]');
        if (!p) return false;
        p.textContent = newObj.content || '';
        return true;
      }
    }
  };

  // Shallow diff — возвращает массив изменённых top-level keys.
  // Глубокое сравнение через JSON.stringify (props не огромные).
  function shallowDiff(oldP, newP) {
    var keys = {};
    var k;
    for (k in (oldP || {})) keys[k] = 1;
    for (k in (newP || {})) keys[k] = 1;
    var changed = [];
    for (k in keys) {
      var oldV = (oldP || {})[k];
      var newV = (newP || {})[k];
      if (JSON.stringify(oldV) !== JSON.stringify(newV)) {
        changed.push(k);
      }
    }
    return changed;
  }

  // Submenu hover (Header dropdown) — delegated on document so it survives
  // hot-update outerHTML swap of Header block. Inline-script внутри Header.astro
  // не re-executes после .outerHTML = html, поэтому держим логику здесь.
  var __submenuTimers = new WeakMap ? new WeakMap() : null;
  function __setOpen(host, open) {
    if (!host) return;
    host.setAttribute('data-open', open ? 'true' : 'false');
  }
  function __openHost(host) {
    if (__submenuTimers && __submenuTimers.has(host)) {
      clearTimeout(__submenuTimers.get(host));
      __submenuTimers.delete(host);
    }
    // Закрыть остальные открытые меню — иначе при движении курсора горизонтально
    // по nav-row на короткий момент видны два submenu (дребезг).
    var others = document.querySelectorAll('[data-submenu-host][data-open="true"]');
    for (var i = 0; i < others.length; i++) {
      if (others[i] !== host) __setOpen(others[i], false);
    }
    __setOpen(host, true);
  }
  function __scheduleClose(host) {
    if (!__submenuTimers) {
      __setOpen(host, false);
      return;
    }
    if (__submenuTimers.has(host)) clearTimeout(__submenuTimers.get(host));
    var t = setTimeout(function () {
      __setOpen(host, false);
      __submenuTimers.delete(host);
    }, 400);
    __submenuTimers.set(host, t);
  }
  document.addEventListener('mouseover', function (e) {
    if (!(e.target instanceof Element)) return;
    var host = e.target.closest('[data-submenu-host]');
    if (host) __openHost(host);
  });
  document.addEventListener('mouseout', function (e) {
    if (!(e.target instanceof Element)) return;
    var host = e.target.closest('[data-submenu-host]');
    if (!host) return;
    var rel = e.relatedTarget instanceof Element ? e.relatedTarget : null;
    if (rel && host.contains(rel)) return;
    // Игнорировать выход на наш overlay/pill — курсор технически вне host,
    // но визуально пользователь всё ещё над Header → не дребезжим.
    if (rel && rel.closest('.__merfy_pill')) return;
    // Если rel null/не-Element — курсор быстро перескочил gap или вышел
    // за iframe; даём шанс mouseover отловить возврат — schedule с delay.
    __scheduleClose(host);
  });
  // Курсор-«докатывание» от link к panel через gap: pointermove проверяет
  // позицию относительно host bbox + панели; если курсор внутри объединённой
  // зоны — отменяем close.
  document.addEventListener('mousemove', function (e) {
    var open = document.querySelector('[data-submenu-host][data-open="true"]');
    if (!open || !__submenuTimers || !__submenuTimers.has(open)) return;
    var hostRect = open.getBoundingClientRect();
    var panel = open.querySelector('[data-submenu-panel]');
    var panelRect = panel ? panel.getBoundingClientRect() : null;
    var x = e.clientX, y = e.clientY;
    var inHost = x >= hostRect.left && x <= hostRect.right && y >= hostRect.top && y <= hostRect.bottom;
    var inPanel = panelRect && x >= panelRect.left && x <= panelRect.right && y >= panelRect.top && y <= panelRect.bottom;
    // Зона «коридор» между host bottom и panel top — тоже считается hover.
    var inCorridor = panelRect && x >= Math.min(hostRect.left, panelRect.left)
      && x <= Math.max(hostRect.right, panelRect.right)
      && y >= hostRect.bottom - 4 && y <= panelRect.top + 4;
    if (inHost || inPanel || inCorridor) {
      clearTimeout(__submenuTimers.get(open));
      __submenuTimers.delete(open);
    }
  });
  // Touch / no-hover: первое нажатие открывает, второе — переходит по ссылке.
  document.addEventListener('click', function (e) {
    if (!(e.target instanceof Element)) return;
    var a = e.target.closest('[data-submenu-trigger]');
    if (!a) return;
    var host = a.closest('[data-submenu-host]');
    if (!host) return;
    if (host.getAttribute('data-open') === 'true') return; // навигация
    if (window.matchMedia && window.matchMedia('(hover: none)').matches) {
      e.preventDefault();
      __openHost(host);
    }
  });

  // Floating action pill — one instance per layer (section vs subsection),
  // can be visible simultaneously.
  function makePill(layer) {
    var pill = document.createElement('div');
    pill.className = '__merfy_pill';
    pill.setAttribute('data-merfy-pill', layer);
    // Puck ActionBar layout: [label group] | [action group with copy + delete].
    pill.innerHTML =
      '<div class="__merfy_pill_group"><span class="__merfy_pill_label"></span></div>' +
      '<div class="__merfy_pill_group">' +
        '<button type="button" class="__merfy_pill_action" data-action="duplicate" title="Скопировать" aria-label="Скопировать">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
        '</button>' +
        '<button type="button" class="__merfy_pill_action" data-action="delete" title="Удалить" aria-label="Удалить">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>' +
        '</button>' +
      '</div>';
    document.body.appendChild(pill);
    pill.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      var btn = e.target && e.target.closest ? e.target.closest('button[data-action]') : null;
      if (!btn) return;
      var action = btn.getAttribute('data-action');
      var target = pill.__merfy_target;
      if (!target) return;
      if (layer === 'section') {
        var blockId = target.getAttribute('data-puck-component-id');
        if (!blockId) return;
        if (action === 'duplicate') post({ type: 'duplicate-block', blockId: blockId });
        else if (action === 'delete') post({ type: 'delete-block', blockId: blockId });
      } else {
        var parentId = target.getAttribute('data-puck-subsection-parent');
        var idx = parseInt(target.getAttribute('data-puck-subsection-index') || '', 10);
        if (!parentId || isNaN(idx)) return;
        if (action === 'duplicate') post({ type: 'duplicate-subsection', parentId: parentId, index: idx });
        else if (action === 'delete') post({ type: 'delete-subsection', parentId: parentId, index: idx });
      }
    }, true);
    // Block hover state from leaking to underlying section while interacting with pill.
    pill.addEventListener('mousedown', function (e) { e.stopPropagation(); }, true);
    return pill;
  }
  // Pupa parity: pill только на section (subsection — только outline, без pill).
  var sectionPill = makePill('section');

  function inferLabel(layer, target) {
    if (layer === 'section') {
      var blockId = target.getAttribute('data-puck-component-id') || '';
      var dashIdx = blockId.indexOf('-');
      var type = dashIdx >= 0 ? blockId.slice(0, dashIdx) : blockId;
      return componentLabels[type] || componentLabels[blockId] || type || 'Секция';
    }
    var parentId = target.getAttribute('data-puck-subsection-parent') || '';
    var dashIdx2 = parentId.indexOf('-');
    var parentType = dashIdx2 >= 0 ? parentId.slice(0, dashIdx2) : parentId;
    return subsectionItemLabels[parentType] || 'Элемент';
  }

  function positionPill(pill, target) {
    if (!target || !target.isConnected) {
      pill.dataset.visible = 'false';
      pill.__merfy_target = null;
      return;
    }
    var rect = target.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      pill.dataset.visible = 'false';
      pill.__merfy_target = null;
      return;
    }
    // If target is entirely above or below viewport — hide.
    if (rect.bottom < 8 || rect.top > window.innerHeight - 8) {
      pill.dataset.visible = 'false';
      pill.__merfy_target = null;
      return;
    }
    var labelEl = pill.querySelector('.__merfy_pill_label');
    if (labelEl) labelEl.textContent = inferLabel(pill.getAttribute('data-merfy-pill'), target);
    pill.__merfy_target = target;
    pill.dataset.visible = 'true';
    requestAnimationFrame(function () {
      var pw = pill.offsetWidth || 120;
      var ph = pill.offsetHeight || 32;
      // Puck-like sticky: anchor at section top + 8, clamped to remain inside section's visible bounds.
      var anchorTop = rect.top + 8;
      var topMin = 8;
      var topMax = Math.max(8, rect.bottom - ph - 8);
      var top = Math.max(topMin, Math.min(topMax, anchorTop));
      var rightAnchor = Math.max(pw + 8, Math.min(window.innerWidth - 8, rect.right - 8));
      var left = rightAnchor - pw;
      pill.style.top = top + 'px';
      pill.style.left = left + 'px';
    });
  }

  function hidePill(pill) {
    pill.dataset.visible = 'false';
    pill.__merfy_target = null;
  }

  // Track current section/subsection (hover takes priority for visibility).
  var hoveredSection = null;
  var hoveredSubsection = null;
  var selectedSectionEl = null;
  var selectedSubsectionEl = null;

  function refreshPills() {
    var secTarget = hoveredSection || selectedSectionEl;
    if (secTarget) positionPill(sectionPill, secTarget); else hidePill(sectionPill);
  }

  // Pupa parity: при hover на секцию подсвечиваем ВСЕ её subsection-параметры
  // вторым слоем. У секции без параметров — подсвечивается только секция.
  function hintAllSubsections(sectionEl) {
    if (!sectionEl) return;
    var sectionId = sectionEl.getAttribute('data-puck-component-id');
    if (!sectionId) return;
    var subs = document.querySelectorAll('[data-puck-subsection-parent="' + sectionId + '"]');
    for (var i = 0; i < subs.length; i++) subs[i].setAttribute('data-puck-subsection-hover', 'true');
  }
  function clearAllSubsectionHints(sectionEl) {
    if (!sectionEl) return;
    var sectionId = sectionEl.getAttribute('data-puck-component-id');
    if (!sectionId) return;
    var subs = document.querySelectorAll('[data-puck-subsection-parent="' + sectionId + '"]');
    for (var i = 0; i < subs.length; i++) subs[i].removeAttribute('data-puck-subsection-hover');
  }

  // Checkout-мегаблоки (CheckoutForm «Оформление заказа» / CheckoutSummary
  // «Сводка заказа») содержат ВНУТРЕННИЕ блоки со своими data-puck-component-id
  // (нужны для __merfyRoot-гидрации DaData/СДЭК/оплаты, Spec 102). В дереве
  // конструктора это ОДНА секция → hover/select резолвим к КОНТЕЙНЕРУ мегаблока
  // (у него тоже есть свой data-puck-component-id), иначе цепляется внутренний
  // блок и пилюля показывает «checkout». Прочие страницы не затронуты — вложенные
  // data-puck-component-id есть только в checkout-мегаблоках.
  function resolveSection(t) {
    if (!t || !t.closest) return null;
    var mega = t.closest('[data-block="checkout-form"],[data-block="checkout-summary"]');
    if (mega && mega.getAttribute('data-puck-component-id')) return mega;
    return t.closest('[data-puck-component-id]');
  }

  document.addEventListener('mouseover', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest && t.closest('[data-merfy-pill]')) return;
    // Если open submenu — Header section hover лочим за Header'ом, не переключаем
    // на нижние секции, даже если курсор визуально над ними (panel абсолютно
    // позиционирован и выходит за bbox Header → нативный switch мерцает outline).
    var openSubmenu = document.querySelector('[data-submenu-host][data-open="true"]');
    if (openSubmenu) {
      var headerSec = openSubmenu.closest('[data-puck-component-id]');
      if (headerSec && hoveredSection !== headerSec) {
        if (hoveredSection) {
          hoveredSection.removeAttribute('data-puck-section-hover');
          clearAllSubsectionHints(hoveredSection);
        }
        headerSec.setAttribute('data-puck-section-hover', 'true');
        hintAllSubsections(headerSec);
        hoveredSection = headerSec;
      }
      refreshPills();
      return;
    }
    var sec = resolveSection(t);
    if (sec !== hoveredSection) {
      if (hoveredSection) {
        hoveredSection.removeAttribute('data-puck-section-hover');
        clearAllSubsectionHints(hoveredSection);
      }
      if (sec) {
        sec.setAttribute('data-puck-section-hover', 'true');
        hintAllSubsections(sec);
      }
      hoveredSection = sec;
    }
    // Track current direct subsection (для click handler).
    hoveredSubsection = t.closest('[data-puck-subsection-parent]');
    refreshPills();
  }, true);
  document.addEventListener('mouseleave', function () {
    if (hoveredSection) {
      hoveredSection.removeAttribute('data-puck-section-hover');
      clearAllSubsectionHints(hoveredSection);
    }
    hoveredSection = null; hoveredSubsection = null;
    refreshPills();
  });

  // Intercept in-document navigation so the parent can swap pages without a
  // full iframe reload (preserves editor state).
  document.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('[data-merfy-pill]')) {
      return;
    }
    // Storefront-кнопки с hard-навигацией внутри iframe конструктора дают 404
    // (origin = gateway, нет маршрутов /checkout, /cart):
    //   • «Оформить» корзины = <button data-action="checkout"> → location='/checkout'
    //   • «Купить сейчас» PDP = <button data-action="buy-now"> → add-to-cart + location='/checkout'
    // Nav-агент пропускает нативные button (чтобы работали add-to-cart/qty/варианты),
    // поэтому эти кнопки проскакивают. Перехватываем ДО пропуска нативных кнопок
    // и просим родителя переключиться на нужную страницу — как для внутренних
    // <a href> выше. stopPropagation глушит bubble-обработчик storefront (capture
    // первее) → hard-навигации не происходит; preventDefault — на случай submit.
    // Зеркалит navigate-путь: pageIdFromPath('/checkout') → page-checkout →
    // switchPage в конструкторе.
    var navBtn = e.target && e.target.closest
      ? e.target.closest('[data-action="checkout"], [data-action="buy-now"], [data-cart-open]')
      : null;
    if (navBtn) {
      // Иконка корзины (<button data-cart-open>): перехватываем на /cart ТОЛЬКО когда
      // «Вид корзины» = Страница (--cart-type: page). В drawer-режиме (Сайдбар, дефолт)
      // НЕ перехватываем — пропускаем клик к NtCartDrawer (bubble-обработчик темы),
      // который открывает сайдбар прямо в превью, как на live. Без этой проверки при
      // «Сайдбар» иконка всё равно уходила навигацией на страницу /cart (баг тестера).
      if (navBtn.hasAttribute('data-cart-open')) {
        var __ct = getComputedStyle(document.documentElement)
          .getPropertyValue('--cart-type').trim().replace(/['"]/g, '');
        if (__ct !== 'page') return;
      }
      e.preventDefault();
      e.stopPropagation();
      // «Купить сейчас» (buy-now) и «Оформить» (checkout) → в оформление (/checkout).
      // Иконка корзины в page-режиме → /cart. Зеркалит navigate-путь <a href>.
      var navPath = navBtn.hasAttribute('data-cart-open') ? '/cart' : '/checkout';
      // «Купить сейчас» = вся корзина + ЭТОТ товар (как на live). Nav-агент глушит
      // обработчик темы (stopPropagation выше), поэтому САМ кладём кликнутый товар в
      // nt-cart — кликом по его add-кнопке В КОНТЕКСТЕ нажатой buy-now (делегат
      // initCartUI пишет в <тема>:cart:v1). Checkout (Spec — рендер из nt-cart) покажет
      // всю корзину + добавленный товар. Express-buynow (sessionStorage) больше не
      // используется — раньше из-за него кликнутый товар пропадал в превью-чекауте.
      if (navBtn.getAttribute('data-action') === 'buy-now') {
        var buyScope = (navBtn.closest && navBtn.closest('[data-product-id], article, section')) || document;
        var addBtn = (buyScope.querySelector && buyScope.querySelector('[data-add-to-cart]')) || document.querySelector('[data-add-to-cart]');
        if (addBtn) { try { addBtn.click(); } catch (e2) {} }
      }
      post({ type: 'navigate', path: navPath });
      return;
    }
    // «В корзину» полностью обрабатывает nt-cart темы (делегат initCartUI): кладёт в
    // «<тема>:cart:v1», обновляет бейдж, открывает дровер — ОДНА логика, как на live.
    // Превью больше НЕ дублирует товар в отдельную серверную корзину.
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (a) {
      var href = a.getAttribute('href') || '';
      // Иконка личного кабинета (data-auth-link → /login|/account) и прочие
      // storefront-ссылки идут обычным navigate-путём ниже: конструктор покажет
      // storefront-страницу в превью (override pageId), не предлагая «создать
      // страницу» (см. onNavigate + isStorefrontSystemPath).
      if (href.startsWith('/') && !href.startsWith('//')) {
        e.preventDefault();
        // Product card link → extract productId from ancestor [data-product-id]
        // (Catalog <article>, PopularProducts <a> wrap, RichCard <div> wrap).
        // Без этого constructor получает navigate без productId → setPreviewProductId
        // не вызывается → preview всегда рендерит дефолтный товар, не выбранный.
        var pidEl = e.target && e.target.closest ? e.target.closest('[data-product-id]') : null;
        var pid = pidEl ? pidEl.getAttribute('data-product-id') : null;
        post(pid ? { type: 'navigate', path: href, productId: pid } : { type: 'navigate', path: href });
        return;
      }
      e.preventDefault();
      return;
    }
    // Native interactive elements (button/input/select/textarea/label) сами
    // обрабатывают клик — preview iframe не должен перехватывать их для
    // section/subsection selection. Это позволяет add-to-cart кнопкам,
    // qty +/-, variant pills, promo apply, и т.д. работать без opt-in
    // через data-puck-interactive. Section hover на родителе сохраняется
    // (mouseover/mouseleave handlers ниже не блокируются).
    var nativeInteractive = e.target && e.target.closest
      ? e.target.closest('button, input, select, textarea, label[for]')
      : null;
    if (nativeInteractive) {
      return;
    }
    // Explicit opt-in для не-native интерактивных контролов (например div
    // с onclick). Legacy fallback — наследуется когда нужен.
    var interactive = e.target && e.target.closest ? e.target.closest('[data-puck-interactive]') : null;
    if (interactive) {
      return;
    }
    var sub = e.target && e.target.closest ? e.target.closest('[data-puck-subsection-parent]') : null;
    if (sub) {
      e.stopPropagation();
      var parentId = sub.getAttribute('data-puck-subsection-parent');
      var indexStr = sub.getAttribute('data-puck-subsection-index');
      var field = sub.getAttribute('data-puck-subsection-field');
      var idx = parseInt(indexStr || '', 10);
      if (parentId && !isNaN(idx)) {
        post({ type: 'select-subsection', parentId: parentId, index: idx, field: field || null });
      }
      return;
    }
    var block = resolveSection(e.target);
    if (block) {
      post({ type: 'select-block', blockId: block.getAttribute('data-puck-component-id') });
    }
  }, true);

  document.addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target;
    var id = (form && (form.id || form.getAttribute('name'))) || '';
    post({ type: 'form-submit-blocked', formId: id });
  }, true);

  window.addEventListener('message', function (ev) {
    if (!ev.data || typeof ev.data !== 'object') return;
    if (ev.data.type === 'set-selection') {
      clearAttr('data-puck-section-selected');
      clearAttr('data-puck-subsection-selected');
      var sectionId = ev.data.sectionId;
      var subParent = ev.data.subsectionParentId;
      var subIndex = ev.data.subsectionIndex;
      selectedSectionEl = null;
      selectedSubsectionEl = null;
      if (sectionId) {
        var sectionEl = document.querySelector('[data-puck-component-id="' + sectionId + '"]');
        if (sectionEl) {
          sectionEl.setAttribute('data-puck-section-selected', 'true');
          selectedSectionEl = sectionEl;
          // Клик по СЕКЦИИ в left outline → доскролл превью к ней. Только если не
          // выбрана вложенная подсекция (её точечный scrollIntoView ниже).
          if (!subParent) sectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
      if (subParent && (typeof subIndex === 'number' || typeof subIndex === 'string')) {
        var subEl = document.querySelector('[data-puck-subsection-parent="' + subParent + '"][data-puck-subsection-index="' + subIndex + '"]');
        if (subEl) {
          subEl.setAttribute('data-puck-subsection-selected', 'true');
          subEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          selectedSubsectionEl = subEl;
        }
      }
      refreshPills();
    } else if (ev.data.type === 'set-labels') {
      if (ev.data.componentLabels && typeof ev.data.componentLabels === 'object') {
        componentLabels = ev.data.componentLabels;
      }
      if (ev.data.subsectionItemLabels && typeof ev.data.subsectionItemLabels === 'object') {
        subsectionItemLabels = ev.data.subsectionItemLabels;
      }
      refreshPills();
    } else if (ev.data.type === 'init') {
      // Запоминаем themeId/siteId для per-theme guard hot-update.
      // Parent шлёт init после iframe ready (см. PreviewFrame.tsx).
      currentThemeId = (ev.data.themeId || '') + '';
      currentSiteId = (ev.data.siteId || '') + '';
      // 091 — populate LAST_PROPS из initial data чтобы первый update-block
      // мог сразу пойти через local-patch (без fetch + outerHTML replace).
      // До этого фикса первый edit любого блока вызывал re-fetch → image flicker.
      var initData = ev.data.data;
      var initContent = initData && initData.content;
      if (Array.isArray(initContent)) {
        for (var ci = 0; ci < initContent.length; ci++) {
          var block = initContent[ci];
          if (block && block.props && block.props.id) {
            LAST_PROPS[block.props.id] = block.props;
          }
        }
      }
    } else if (ev.data.type === 'update-block') {
      // Hot-replace включён для всех тем после консолидации на packages/theme-base
      // (2026-05-10). До этого был allowlist [rose, vanilla].
      // Если currentThemeId пустой (init не пришёл) — пропускаем.
      if (!currentThemeId) return;
      var blockId = ev.data.blockId;
      if (!blockId || !currentSiteId) return;
      var blockType = blockId.split('-')[0];
      if (!blockType) return;

      // Spec 090 — local-patch attempt перед server fetch fallback.
      var newProps = ev.data.props || {};
      var oldProps = LAST_PROPS[blockId];
      var elNow = document.querySelector('[data-puck-component-id="' + blockId + '"]');
      var canPatch = false;
      if (window.__MERFY_LOCAL_PATCH_ENABLED && elNow && oldProps) {
        var registry = LOCAL_PATCH_REGISTRY[blockType];
        if (registry) {
          var changed = shallowDiff(oldProps, newProps);
          canPatch = changed.length > 0 && changed.every(function (k) {
            return typeof registry[k] === 'function';
          });
          if (canPatch) {
            try {
              for (var ci = 0; ci < changed.length; ci++) {
                var key = changed[ci];
                var ok = registry[key](elNow, oldProps[key], newProps[key]);
                if (!ok) { canPatch = false; break; }
              }
            } catch (patchErr) {
              console.warn('[preview] local patch threw', patchErr);
              canPatch = false;
            }
          }
        }
      }

      if (canPatch) {
        LAST_PROPS[blockId] = newProps;
        return; // local patch applied — fetch skipped
      }

      // 098-fix: seq берём ДО fetch — ответы применяются строго в порядке
      // отправки, stale (обогнанные) отбрасываются.
      var mySeq = (UPDATE_SEQ[blockId] = (UPDATE_SEQ[blockId] || 0) + 1);

      fetch('/api/sites/' + currentSiteId + '/preview/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockType: blockType, props: newProps, themeId: currentThemeId }),
      })
        .then(function (r) {
          if (!r.ok) {
            console.error('[preview] update-block HTTP ' + r.status + ' for ' + blockId + ' — keep old DOM');
            return null;
          }
          return r.text();
        })
        .then(function (html) {
          if (html === null) return;
          if (!isValidBlockHtml(html, blockId)) {
            console.error('[preview] update-block invalid HTML for ' + blockId + ' — keep old DOM:', String(html).slice(0, 120));
            return;
          }
          if ((APPLIED_SEQ[blockId] || 0) >= mySeq) return; // stale — новее уже применён
          APPLIED_SEQ[blockId] = mySeq;
          var el = document.querySelector('[data-puck-component-id="' + blockId + '"]');
          if (!el) return;
          // 097: при наличии scheme wrapper — обновляем его class в соответствии
          // с newProps.colorScheme. Раньше wrapper class был frozen от initial
          // render, поэтому смена colorScheme в Puck не меняла внешнюю
          // dark/light scheme, только inner section CSS-vars.
          var wrapper = el.parentElement;
          var schemeAttr = 'data-block-' + 'scheme';
          var hasSchemeWrapper = wrapper && wrapper.hasAttribute(schemeAttr);
          // Нормализация newProps.colorScheme → newSchemeId — нужна ОБЕИМ
          // веткам (sync существующей обёртки И создание новой on demand).
          var rawScheme = newProps && newProps.colorScheme;
          var newSchemeId = '';
          if (typeof rawScheme === 'string' && rawScheme.length > 0) {
            newSchemeId = String(rawScheme).replace(/^scheme-/, '');
          } else if (typeof rawScheme === 'number') {
            newSchemeId = String(rawScheme);
          }
          if (hasSchemeWrapper) {
            // Sync wrapper class to current newProps.colorScheme (cleaned through
            // theme defaults server-side — see deepMergeBlockProps stale guard).
            if (newSchemeId) {
              wrapper.className = 'color-scheme-' + newSchemeId;
              wrapper.setAttribute(schemeAttr, newSchemeId);
            } else {
              // Симметрия: scheme снят в Puck — снимаем класс и атрибут,
              // обёртка становится инертным div (цвета возвращаются к базе).
              wrapper.className = '';
              wrapper.removeAttribute(schemeAttr);
            }
            wrapper.innerHTML = html;
            // 098 systemic fix: HTML5 не выполняет <script> теги добавленные
            // через innerHTML. Без этого hot-replaced блоки (Catalog/Collections/
            // PopularProducts/Gallery/etc) не re-hydrate — placeholders остаются
            // visible вместо real products. Воссоздаём <script> элементы вручную
            // — браузер их выполнит. Idempotency на стороне блока через
            // data-X-hydrated атрибуты.
            executeScriptsIn(wrapper);
          } else if (newSchemeId) {
            // Обёртки нет, а scheme выбран — создаём wrapper on demand,
            // зеркально серверному рендеру (v2-page-composer wrapScheme).
            // Без этого первый выбор colorScheme у блока не красил секцию
            // до полного reload превью.
            el.outerHTML = '<div class="color-scheme-' + newSchemeId + '" ' + schemeAttr + '="' + newSchemeId + '">' + html + '</div>';
            var newWrapped = document.querySelector('[data-puck-component-id="' + blockId + '"]');
            if (newWrapped) executeScriptsIn(newWrapped.parentElement || newWrapped);
          } else {
            el.outerHTML = html;
            // Same fix для no-wrapper case. После outerHTML el detached —
            // ищем новый по blockId.
            var newEl = document.querySelector('[data-puck-component-id="' + blockId + '"]');
            if (newEl) executeScriptsIn(newEl.parentElement || newEl);
          }
          LAST_PROPS[blockId] = newProps;
        })
        .catch(function (err) {
          console.error('[preview] update-block fetch failed', err);
        });
      // 106 T021: ветки add-block/remove-block удалены — структурные изменения
      // (add/remove/hide/show/reorder) идут единым каналом reconcile (idiomorph).
      // Конструктор их больше не шлёт (PreviewFrame.test.tsx проверяет length 0).
    } else if (ev.data.type === 'update-tokens') {
      // Hot-replace tokens.css включён для всех тем после консолидации
      // на packages/theme-base (2026-05-10). До этого был allowlist
      // [rose, vanilla] — symmetric to update-block fix.
      if (!currentThemeId) return;
      if (!currentSiteId) return;
      fetch('/api/sites/' + currentSiteId + '/preview/tokens-css', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ themeSettings: ev.data.themeSettings, themeId: currentThemeId }),
      })
        .then(function (r) { return r.text(); })
        .then(function (css) {
          var styleEl = document.getElementById('__merfy_tokens_css');
          if (!styleEl) return;
          styleEl.textContent = css;
        })
        .catch(function (err) {
          console.error('[preview] update-tokens fetch failed', err);
        });
    } else if (ev.data.type === 'reconcile') {
      // 106: идемпотентно сводим <main> к целевому списку видимых body-секций.
      // Header/PromoBanner (до <main>) и Footer (после) — хром, вне main, только
      // hide/show. Источник разметки каждого блока: живой узел main (reuse, DOM
      // авторитетен) → stash при совпадении propsHash (показ без сети) → server
      // fetch (НОВЫЙ блок US2 ИЛИ скрытая секция, отредактированная пока скрыта).
      var rcVersion = Number(ev.data.version) || 0;
      if (rcVersion <= RC_APPLIED_VERSION) return; // stale — новее уже применён
      var rcTarget = ev.data.blocks || [];
      var rcMain = document.querySelector('main');
      if (typeof Idiomorph === 'undefined' || !rcMain) {
        post({ type: 'reconcile-ack', version: rcVersion, ok: false, applied: [], missing: rcTarget.map(function (b) { return b && b.id; }) });
        return; // нет движка/контейнера → агрессивный режим: parent перезагрузит iframe
      }
      __rcMirrorIds(rcMain);
      var rcParts = [];      // body-блоки в целевом порядке (HTML); fetch заполняет плейсхолдеры
      var rcFetchJobs = [];  // { partIndex, id, type, props, propsHash } — новые/изменённые body
      var rcNewChrome = [];  // новый хром-блок без DOM — вне инкрементального пути → reload
      for (var rti = 0; rti < rcTarget.length; rti++) {
        var rtb = rcTarget[rti];
        if (!rtb || !rtb.id) continue;
        var rcLive = __rcTopChild(rtb.id, rcMain);
        if (rcLive) {
          // Живой узел main — DOM авторитетен (update-block держит видимые свежими).
          RC_RENDERED_HASH[rtb.id] = rtb.propsHash;
          rcParts.push(rcLive.outerHTML);
          continue;
        }
        var rcDomEl = document.querySelector('[data-puck-component-id="' + rtb.id + '"]');
        if (rcDomEl && !rcMain.contains(rcDomEl)) continue; // хром (вне main) — CSS-toggle в __rcApply
        if (RC_STASH[rtb.id] && RC_RENDERED_HASH[rtb.id] === rtb.propsHash) {
          rcParts.push(RC_STASH[rtb.id]); // stash + контент не менялся → мгновенно без сети
          continue;
        }
        // Новый body-блок ИЛИ скрытый отредактированный → серверный фрагмент (US2).
        if (rtb.type === 'Header' || rtb.type === 'Footer' || rtb.type === 'PromoBanner') {
          rcNewChrome.push(rtb.id); // новый хром-блок без DOM — редкость → аварийный reload
          continue;
        }
        rcFetchJobs.push({ partIndex: rcParts.length, id: rtb.id, type: rtb.type, props: rtb.props, propsHash: rtb.propsHash });
        rcParts.push(''); // плейсхолдер; заполнит fetch
      }
      if (rcNewChrome.length) {
        post({ type: 'reconcile-ack', version: rcVersion, ok: false, applied: [], missing: rcNewChrome });
        return; // parent сделает один тихий reload (T009)
      }
      if (!rcFetchJobs.length) {
        __rcApply(rcVersion, rcTarget, rcMain, rcParts); // быстрый путь: hide/show/reorder/delete — без сети
        return;
      }
      // US2: дофетчить новые/изменённые body-блоки параллельно, затем применить.
      if (!currentSiteId) {
        post({ type: 'reconcile-ack', version: rcVersion, ok: false, applied: [], missing: rcFetchJobs.map(function (j) { return j.id; }) });
        return;
      }
      var rcMissing = [];
      Promise.all(rcFetchJobs.map(function (job) {
        return fetch('/api/sites/' + currentSiteId + '/preview/block', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blockType: job.type, props: job.props, themeId: currentThemeId }),
        })
          .then(function (r) { return r.ok ? r.text() : null; })
          .then(function (html) {
            if (html === null || !isValidBlockHtml(html, null)) { rcMissing.push(job.id); return; }
            rcParts[job.partIndex] = html;
            RC_RENDERED_HASH[job.id] = job.propsHash;
          })
          .catch(function () { rcMissing.push(job.id); });
      })).then(function () {
        if (rcVersion <= RC_APPLIED_VERSION) return; // вытеснен более новым reconcile, пока фетчили
        if (rcMissing.length) {
          // fetch фрагмента провалился / невалиден → parent сделает один тихий reload (T015→T009)
          post({ type: 'reconcile-ack', version: rcVersion, ok: false, applied: [], missing: rcMissing });
          return;
        }
        __rcApply(rcVersion, rcTarget, rcMain, rcParts);
      });
    }
  });

  // Reposition pills on scroll/resize (target may move).
  var rafScheduled = false;
  function scheduleRefresh() {
    if (rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(function () { rafScheduled = false; refreshPills(); });
  }
  window.addEventListener('scroll', scheduleRefresh, true);
  window.addEventListener('resize', scheduleRefresh);

  // Signal readiness so the parent can send 'init'.
  post({ type: 'ready' });

  // ── Inline (in-canvas) editing (Spec 101) — секция «Страница» heading/content.
  // [data-edit-field] → contenteditable; на blur постим в конструктор → Puck
  // props (edit-field). РЕАЛЬНЫЙ превью-агент = ЭТА строка, НЕ runtime/preview-nav-agent.ts.
  (function () {
    var esId = '__merfy_edit_style';
    if (document.head && !document.getElementById(esId)) {
      var es = document.createElement('style');
      es.id = esId;
      es.textContent = '[data-edit-field][contenteditable]:empty:before{content:attr(data-edit-placeholder);color:rgb(var(--color-muted));opacity:.55;pointer-events:none}';
      document.head.appendChild(es);
    }
    function applyEditable() {
      var els = document.querySelectorAll('[data-edit-field]');
      for (var i = 0; i < els.length; i++) {
        if (els[i].getAttribute('contenteditable') !== 'true') els[i].setAttribute('contenteditable', 'true');
      }
    }
    applyEditable();
    var sched = false;
    function schedule() {
      if (sched) return; sched = true;
      Promise.resolve().then(function () { sched = false; try { applyEditable(); } catch (e) {} });
    }
    try { if (document.body) new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true }); } catch (e) {}
    document.addEventListener('focusout', function (e) {
      var t = e.target;
      var el = t && t.closest ? t.closest('[data-edit-field]') : null;
      if (!el) return;
      var f = el.getAttribute('data-edit-field');
      var v = f === 'content' ? el.innerHTML : (el.textContent || '').trim();
      var host = el.closest('[data-puck-component-id]');
      var bid = host ? host.getAttribute('data-puck-component-id') : null;
      if (bid && f) post({ type: 'edit-field', blockId: bid, field: f, value: v });
    }, true);
  })();
})();
`;

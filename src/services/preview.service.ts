import { Injectable, Optional } from '@nestjs/common';

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
const defaultComponentResolver: ComponentResolver = async (
  blockName,
  themeId,
) => {
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
    const Component = await this.componentResolver(
      input.blockName,
      input.themeId ?? null,
    );
    const themeDefaults = await this.loadThemeBlockDefaults(input.themeId);
    const blockDefaults = (themeDefaults[input.blockName] as Record<string, unknown> | undefined) ?? {};
    const mergedProps = { ...blockDefaults, ...input.props };
    const container = await this.getContainer();
    const html = await container.renderToString(Component, {
      props: mergedProps,
    });
    return html;
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
   * Render a full preview page: doctype, head (fontHead + tokens.css),
   * each block's HTML, and the preview nav agent installer.
   */
  async renderPreviewPage(input: RenderPreviewPageInput): Promise<string> {
    const pageKey = input.page ?? 'home';
    const isCheckout = pageKey === 'checkout' || pageKey === 'page-checkout';
    let bodyHtml: string;

    if (isCheckout) {
      // Mirror live /checkout.astro slot-based layout: header on top, summary
      // toggle, then 2-column form/summary inside CheckoutLayout.
      bodyHtml = await this.renderCheckoutLayout(input);
    } else {
      const renderedBlocks: string[] = [];
      for (const b of input.blocks) {
        const html = await this.renderBlock({
          blockName: b.type,
          props: b.props,
          themeId: input.themeId ?? null,
        });
        // Mirror live build: wrap block in color-scheme-N so tokens-css.ts
        // .color-scheme-N overrides apply per-block.
        const rawScheme = b.props?.colorScheme;
        let schemeId: string | null = null;
        if (typeof rawScheme === 'number' && Number.isFinite(rawScheme)) {
          schemeId = String(rawScheme);
        } else if (typeof rawScheme === 'string' && rawScheme.length > 0) {
          schemeId = rawScheme.replace(/^scheme-/, '');
        }
        if (schemeId) {
          renderedBlocks.push(
            `<div class="color-scheme-${schemeId}" data-block-scheme="${schemeId}">${html}</div>`,
          );
        } else {
          renderedBlocks.push(html);
        }
      }
      bodyHtml = renderedBlocks.join('\n');
    }

    const previewTailwind = await loadPreviewTailwindCss();

    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Preview</title>
  ${input.fontHead}
  <style>${previewTailwind}</style>
  <style id="__merfy_tokens_css">${input.tokensCss}</style>
</head>
<body>
  ${bodyHtml}
  <script>${PREVIEW_NAV_AGENT_INLINE}</script>
</body>
</html>`;
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

    const renderOne = async (b: { type: string; props: Record<string, unknown> }) =>
      this.renderBlock({ blockName: b.type, props: b.props, themeId });

    const headerHtml = headerBlock ? await renderOne(headerBlock) : '';
    const toggleHtml = summaryToggleBlock
      ? await renderOne(summaryToggleBlock)
      : '';

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
      '[data-puck-component-id]{position:relative}',
      '[data-puck-section-hover="true"]{outline:2px solid #cfdff0 !important;outline-offset:-2px;z-index:1}',
      '[data-puck-section-hover="true"]::after{content:"";position:absolute;inset:0;background:rgba(171,199,229,0.3);pointer-events:none;z-index:0}',
      '[data-puck-section-selected="true"]{outline:2px solid #88b0da !important;outline-offset:-2px;z-index:2}',
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
      '.__merfy_pill_action svg{width:16px;height:16px;display:block;pointer-events:none}'
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
        return true;
      },
      navigationLinks: function (el, oldVal, newVal) {
        var oa = Array.isArray(oldVal) ? oldVal : [];
        var na = Array.isArray(newVal) ? newVal : [];
        if (oa.length !== na.length) return false;
        for (var i = 0; i < na.length; i++) {
          var oldSub = (oa[i] && Array.isArray(oa[i].submenu)) ? oa[i].submenu : [];
          var newSub = (na[i] && Array.isArray(na[i].submenu)) ? na[i].submenu : [];
          if (oldSub.length !== newSub.length) return false;
        }
        var topLinks = el.querySelectorAll('[data-nav-inline] > div > a, [data-nav-inline] > a');
        if (topLinks.length !== na.length) return false;
        for (var j = 0; j < na.length; j++) {
          var a = topLinks[j];
          a.textContent = na[j].label || '';
          a.href = na[j].href || '/';
          var parent = a.parentElement;
          var subAs = parent ? parent.querySelectorAll('[data-submenu-panel] a, [data-submenu-panel] > div > a') : [];
          var subs = Array.isArray(na[j].submenu) ? na[j].submenu : [];
          for (var k = 0; k < subs.length && k < subAs.length; k++) {
            subAs[k].textContent = subs[k].label || '';
            subAs[k].href = subs[k].href || '/';
          }
        }
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
    }, 220);
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
    __scheduleClose(host);
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

  document.addEventListener('mouseover', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest && t.closest('[data-merfy-pill]')) return;
    var sec = t.closest('[data-puck-component-id]');
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
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (a) {
      var href = a.getAttribute('href') || '';
      if (href.startsWith('/') && !href.startsWith('//')) {
        e.preventDefault();
        post({ type: 'navigate', path: href });
        return;
      }
      e.preventDefault();
      return;
    }
    // Whitelist: don't hijack clicks on interactive controls (variant pills,
    // qty +/-, cart buttons, etc). Such elements opt-in via data-puck-interactive
    // so block.astro inline JS gets the click for state changes.
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
    var block = e.target && e.target.closest ? e.target.closest('[data-puck-component-id]') : null;
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

      fetch('/api/sites/' + currentSiteId + '/preview/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockType: blockType, props: newProps, themeId: currentThemeId }),
      })
        .then(function (r) { return r.text(); })
        .then(function (html) {
          var el = document.querySelector('[data-puck-component-id="' + blockId + '"]');
          if (!el) return;
          // Replace outerHTML; preserve enclosing color-scheme wrapper if any.
          var wrapper = el.parentElement;
          var schemeAttr = 'data-block-' + 'scheme';
          var hasSchemeWrapper = wrapper && wrapper.hasAttribute(schemeAttr);
          if (hasSchemeWrapper) {
            wrapper.innerHTML = html;
          } else {
            el.outerHTML = html;
          }
          LAST_PROPS[blockId] = newProps;
        })
        .catch(function (err) {
          console.error('[preview] update-block fetch failed', err);
        });
    } else if (ev.data.type === 'add-block') {
      // Structural insert without iframe reload. Parent посылает blockId,
      // blockType, props, и beforeBlockId (вставить перед этим блоком,
      // null = в конец). Fetch HTML и insertAdjacentHTML.
      if (!currentSiteId) return;
      var addBlockType = ev.data.blockType;
      var addBlockId = ev.data.blockId;
      var addBeforeId = ev.data.beforeBlockId;
      if (!addBlockType || !addBlockId) return;
      fetch('/api/sites/' + currentSiteId + '/preview/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockType: addBlockType, props: ev.data.props, themeId: currentThemeId }),
      })
        .then(function (r) { return r.text(); })
        .then(function (html) {
          // Найти точку вставки.
          if (addBeforeId) {
            var ref = document.querySelector('[data-puck-component-id="' + addBeforeId + '"]');
            // Если у ref есть color-scheme wrapper — вставлять перед ним.
            var refSchemeAttr = 'data-block-' + 'scheme';
            var refTarget = ref && ref.parentElement && ref.parentElement.hasAttribute(refSchemeAttr) ? ref.parentElement : ref;
            if (refTarget && refTarget.parentElement) {
              refTarget.insertAdjacentHTML('beforebegin', html);
              return;
            }
          }
          // Append в конец main.
          var container = document.querySelector('main') || document.body;
          container.insertAdjacentHTML('beforeend', html);
        })
        .catch(function (err) { console.error('[preview] add-block fetch failed', err); });
    } else if (ev.data.type === 'remove-block') {
      // Удалить блок из DOM по blockId.
      var rmId = ev.data.blockId;
      if (!rmId) return;
      var rmEl = document.querySelector('[data-puck-component-id="' + rmId + '"]');
      if (rmEl) {
        // Если есть color-scheme wrapper — удалить его тоже.
        var rmParent = rmEl.parentElement;
        var rmSchemeAttr = 'data-block-' + 'scheme';
        if (rmParent && rmParent.hasAttribute(rmSchemeAttr)) {
          rmParent.parentElement && rmParent.parentElement.removeChild(rmParent);
        } else {
          rmEl.parentElement && rmEl.parentElement.removeChild(rmEl);
        }
      }
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
})();
`;

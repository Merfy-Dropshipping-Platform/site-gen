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
      diag.push(`${root}: [${entries.length} entries] ${entries.slice(0, 5).join(', ')}${entries.length > 5 ? '...' : ''}`);
    } catch (e) {
      diag.push(`${root}: NOT-EXIST (${(e as NodeJS.ErrnoException).code ?? 'unknown'})`);
    }
  }

  throw new Error(
    `Block "${blockName}" not resolvable for themeId="${themeId ?? 'base'}". ` +
      `Run 'pnpm build:blocks' first. Last error: ${String(lastErr)}. ` +
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
   * Render a single named block to an HTML string.
   */
  async renderBlock(input: RenderBlockInput): Promise<string> {
    // Resolve first so unknown blocks fail fast without initializing the container.
    const Component = await this.componentResolver(
      input.blockName,
      input.themeId ?? null,
    );
    const container = await this.getContainer();
    const html = await container.renderToString(Component, {
      props: input.props,
    });
    return html;
  }

  /**
   * Render a full preview page: doctype, head (fontHead + tokens.css),
   * each block's HTML, and the preview nav agent installer.
   */
  async renderPreviewPage(input: RenderPreviewPageInput): Promise<string> {
    const renderedBlocks: string[] = [];
    for (const b of input.blocks) {
      const html = await this.renderBlock({
        blockName: b.type,
        props: b.props,
        themeId: input.themeId ?? null,
      });
      // Mirror live build: wrap block in color-scheme-N so tokens-css.ts
      // .color-scheme-N overrides apply per-block. Keeps iframe preview at
      // parity with the baked Astro page (see page-generator.ts).
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

    const previewTailwind = await loadPreviewTailwindCss();

    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Preview</title>
  ${input.fontHead}
  <style>${previewTailwind}</style>
  <style>${input.tokensCss}</style>
</head>
<body>
  ${renderedBlocks.join('\n')}
  <script>${PREVIEW_NAV_AGENT_INLINE}</script>
</body>
</html>`;
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

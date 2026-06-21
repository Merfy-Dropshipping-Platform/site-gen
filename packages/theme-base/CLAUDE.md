# @merfy/theme-base — AI Rules

**Role:** Shared Astro component library for all Merfy storefronts. 20 blocks + chrome + primitives + SEO + runtime + fonts.

## Block Anatomy (MUST)

```
blocks/X/
├─ X.puckConfig.ts   — Puck fields, defaults, Zod schema
├─ X.tokens.ts       — CSS var whitelist
├─ X.classes.ts      — Tailwind class objects (SHARED source)
├─ X.astro           — SSG + iframe preview + incremental render
├─ X.variants.ts     — [optional] layout variants
├─ X.migrations.ts   — [optional] data mappings
├─ X.stories.ts      — [optional] visual-diff fixtures
└─ index.ts          — barrel
```

## Forbidden

- `.tsx` files next to blocks (renderer is Astro-only)
- Hex / rgb() / hsl() literals in `.astro` or `.classes.ts` — use `rgb(var(--color-*))`
- Tailwind class strings directly in `.astro` — only from `X.classes.ts`
- CSS vars not declared in `X.tokens.ts`
- Hardcoded fonts — must flow through theme.fonts + `fonts/loader.ts`
- `document.querySelector` / `document.querySelectorAll` / `document.getElementById` to locate a block's OWN root or elements — first-match silently breaks pages with 2+ identical sections (only the first hydrates). See below.

## Inline hydration scripts — block root (Spec 102)

Every `<script is:inline>` that hydrates a block MUST resolve its own root via the
shared `window.__merfyRoot(blockId)` primitive — never a document-level lookup.

```astro
<section data-block="x" data-puck-component-id={id}> … </section>
<script is:inline define:vars={{ blockId: id, /* siteId, … */ }}>
  (function () {
    var root = window.__merfyRoot(blockId);   // by data-puck-component-id; survives hot-replace
    if (!root) return;
    // ALL element access via root.querySelector(...) / root.addEventListener(...)
  })();
</script>
```

- `__merfyRoot` is injected into `<head>` for both live (`build.service.injectBlockRootHelper`)
  and preview (`preview.controller.injectPreviewGlobals`); source: `src/common/block-root-inline.ts`.
- Allowed at document level (not element-finding): `document.addEventListener`, `document.body`, `document.cookie`.
- Genuine cross-block / page-singleton coordination (e.g. checkout blocks reading another
  block's field by fixed id) may keep a document lookup IF the line is annotated
  `// merfy-root-allow: <reason>`.
- Guard: `__tests__/block-root-scoping.test.ts` fails the build on any unannotated
  document-level element lookup in a block.

## Adding a new block

Follow playbook `@merfy/theme-contract/playbooks/ADD_NEW_BLOCK.md`.
Reference implementation: `blocks/Hero/` (pilot from Phase 0).

## Adding a new variant

1. Add entry to existing `X.variants.ts`.
2. Add corresponding rendering conditional in `X.astro`.
3. Add CSS classes to `X.classes.ts`.
4. Add story case to `X.stories.ts` so visual-diff covers it.
5. DO NOT change prop shape — variants keep props identical.

## Runtime (`runtime/preview-nav-agent.ts`)

- This file is injected ONLY in constructor preview iframe, NOT in live builds.
- Intercepts link clicks → postMessage navigate; form submits → blocked + postMessage; element with `data-puck-component-id` → postMessage select-block.
- Changes here affect constructor ↔ iframe contract. Coordinate with `backend/services/constructor/src/components/editor/PreviewFrame.tsx` (Phase 1).

## SEO (`seo/*.astro`)

- Baseline enforced by `validateSEO` in `@merfy/theme-contract`. Do not weaken.
- Product JSON-LD, Organization schema, sitemap, robots — handled here (scaffolds in Phase 0, full impl in Phase 1).

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

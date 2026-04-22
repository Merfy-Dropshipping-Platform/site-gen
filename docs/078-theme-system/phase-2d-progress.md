# Phase 2d progress — Extend Base Blocks

**Status:** partial — foundation done, library-level extensions complete for the highest-impact gap (Hero multi-image). Remaining gaps are smaller and deferrable.

**Generated:** 2026-04-22

## ✅ Completed

### Audit classification (fidelity improvement)

`scripts/figma/audit.ts` now cross-references block code when reporting gaps:
- Reads each block's `puckConfig.ts` → detects `columns`, array props, form fields, radius tokens
- Reads each block's `classes.ts` + `.astro` → detects `var(--radius-*)` usage and `<form>` templates
- Classifies each Figma hint as:
  - 🔴 **REAL GAP** — block cannot express the Figma pattern today
  - 🟢 **covered (props)** — existing prop already handles this
  - 🟢 **covered (tokens)** — per-theme tokens already control this visual detail
  - 🟡 **review** — runtime-interactive block (AuthModal / CartDrawer / CheckoutSection); Figma mock is reference only, not a Puck-prop extension target

Effect on current Figma inventory:
| | Before classification | After Phase 2d |
|-|---|---|
| 🔴 Real gaps | n/a (unclassified) | **10** |
| 🟢 Covered (props/tokens) | n/a | **16** |
| 🟡 Review (runtime) | n/a | 3 |

### `@merfy/theme-base/blocks/Hero` — grid-4 variant

Rose and Bloom Figma designs include 2×2 image-grid hero layouts. Added as a first-class variant:

- `HeroSchema.variant` extended: `'centered' | 'split' | 'overlay' | 'grid-4'`
- `HeroSchema.images`: new optional `z.array({url, alt}).max(8)` prop
- `Hero.astro` renders a responsive 2×2 grid when `variant === 'grid-4'`, with empty-slot fallback using the single `image` prop
- `Hero.classes.ts`: new `inner['grid-4']`, `image['grid-4']`, `gridContainer`, `gridTile` classes
- `Hero.variants.ts`: new `grid-4` entry with `imagePosition: 'grid-above-text'`
- Backwards compatible — existing presets with variant `'centered' | 'split' | 'overlay'` unchanged
- 9 tests pass (4 new covering the schema)
- `pnpm verify:astro` — 35/35 blocks PASS including Hero

### `Footer.classes.ts` — newsletter form tokenised

`rounded-md` (hardcoded 6px) in newsletter-form classes replaced with `rounded-[var(--radius-input)]`. Themes with pill-shaped inputs (Bloom, via tokens.json `radius.input`) now render correctly.

## 🟡 Remaining "real gaps" (by significance)

### Significant — worth implementing when needed

- **Product — `multi-image` gallery** (bloom, rose, satin, vanila). Product detail pages in all 4 themes show product photo galleries. Current block has single image. Recommended: add `images: string[]` array prop + gallery variants (carousel, grid, thumbnails). Non-trivial design work, deferred until Phase 2e reveals exact Figma patterns.

### Likely false positives (audit heuristic limitations)

The `has-form` heuristic fires when Figma frames contain inputs / email-looking shapes. For content blocks that occasionally render a CTA button (e.g. Hero) next to the Figma designer's mock input bar, this is a false positive.

- **Hero — has-form** (bloom, rose) — Figma hero's CTA button likely misclassified. Hero already has `cta: {text, href}`.
- **Gallery — has-form** (flux) — Gallery is images, not a form block.
- **MainText — has-form** (flux) — MainText renders rich text, no form.
- **Product — has-form** (rose, vanila) — "add to cart" button mistakenly detected.
- **MainText — pill (radius≥60)** (bloom) — MainText has no rounded elements. Likely a button label inside Figma.
- **MainText — grid-2col** (flux) — MainText has no grid; Figma mock includes a 2-column block adjacent.
- **ImageWithText — grid-2col** (satin) — ImageWithText IS already a 2-col layout (image+text). Redundant hint.
- **Product — grid-3col / grid-2col** (flux, rose, bloom) — Product showcases thumbnails inside; hint fires on internal layout that already works.

### Deferred — runtime blocks (3 🟡 review)

- **AuthModal — has-form** (flux, rose) — React island; Figma mock is reference only. Not extended via Puck props.
- **CartDrawer — has-form, multi-image, grid-3col** (flux, rose, bloom, satin, vanila) — React island; renders cart state dynamically. No Phase 2d action.
- **CheckoutSection — has-form** (rose) — React island (YooKassa/Tochka checkout).

## 🧭 Recommended next steps

1. **Phase 2e ("Build 5 presets")** — start building presets through constructor with rose first. Use `pnpm figma:snapshot --theme rose` + `docs/078-theme-system/figma-inventory.json` as reference. The library is now expressive enough to attempt Rose (grid-4 hero supported).

2. **Improve `has-form` heuristic** (when audit noise becomes bothersome) — only flag if Figma frames contain actual input-shaped nodes (rectangular, wide ≥200px, tall 30-60px, adjacent to a button or label containing word "email" / "message" / "submit").

3. **Product gallery** — revisit after Phase 2e reveals which themes actually need gallery and in which style. Likely a dedicated mini-phase with its own design session.

4. **Document decisions in `BLOCK_INVENTORY.md`** as Phase 2d extensions are made.

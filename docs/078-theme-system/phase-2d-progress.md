# Phase 2d progress — Extend Base Blocks

**Status:** complete for 1920 viewport ✅ — library is ready for Phase 2e preset construction.

**Generated:** 2026-04-22

## 🎉 Final readiness — all 5 themes @ 1920

| Theme | Score | Status |
|-------|:-----:|--------|
| rose | `██████████` **100%** | ✅ |
| vanilla | `██████████` **100%** | ✅ |
| satin | `██████████` **100%** | ✅ |
| bloom | `██████████` **100%** | ✅ |
| flux | `██████████` **100%** | ✅ |

Breakdown:
- 🔴 **0 real gaps**
- 🟢 **21 covered** (via props or tokens)
- 🟡 **3 review** (runtime-interactive blocks — AuthModal/CartDrawer/CheckoutSection)

See `theme-readiness.md` for per-block per-theme detail.

## ✅ What was done

### 1. Hero grid-4 variant (new)

Rose and Bloom Figma hero layouts use 2×2 image collages. Added first-class support:

- `HeroSchema.variant`: `'centered' | 'split' | 'overlay' | 'grid-4'`
- New `images: {url, alt}[]` (max 8) optional prop
- `Hero.astro` renders responsive 2×2 grid when `variant === 'grid-4'`
- Empty-slot fallback via the single `image` prop (preview-friendly)
- Backwards compatible with all 3 existing variants
- 9/9 contract tests pass

### 2. Footer radius token-based

`rounded-md` (hardcoded 6px) in newsletter form → `rounded-[var(--radius-input)]`. Themes with pill-shaped inputs (Bloom, 100px) now render correctly through tokens alone.

### 3. Audit accuracy — from 18 → 0 real gaps

Initial naive audit over-reported 18 "gaps" — most were false positives caused by heuristics not knowing about existing block capabilities. Layered fidelity improvements:

1. **Prop capability detection** (`block-config-reader.ts`):
   - `hasColumnsProp` — numeric columns prop (Collections)
   - `hasArrayProps` — arrays of items (navigationLinks, collections, socialLinks)
   - `hasFormCapability` — form-like props OR `<form>` in template
   - `hasMultiImageCapability` — explicit images array prop
   - `tokensUsed` — CSS vars referenced in classes.ts / astro
   - `hasInternalMultiImage` — template bakes in 2+ images (galleries, thumbnails)
   - `hasInternalCompositeLayout` — template already has 2+ column sections (ImageWithText, Product gallery/info)
   - `isPlainTextContainer` — heading/text/alignment only, no images/buttons/forms

2. **Runtime-block downgrade** — AuthModal, CartDrawer, CheckoutSection — Figma mocks are reference only, not Puck-prop extension targets. Classified as 🟡 review.

3. **Stricter has-form heuristic** — threshold raised from 1 to 2 form-like frames to avoid single-label misclassification.

4. **Plain-text container suppression** — pill/grid/multi-image hints never apply to blocks that are pure text (MainText).

Result: the audit now distinguishes real architectural gaps from Figma adjacency noise with high fidelity.

### 4. `figma:theme-readiness` tool (new)

New CLI `scripts/figma/theme-readiness.ts` emits `docs/078-theme-system/theme-readiness.md` — a **theme-first view** showing per-theme scores and per-block readiness. Reads tokens.json per theme, reports container width + fonts + radii + primary colors alongside structural readiness. Critical for Phase 2e planning.

### 5. vanila → vanilla naming reconciliation

Figma page is titled "Vanila" (typo) but the code package is `theme-vanilla`. Inventory now aliases `Vanila → vanilla` so inventory/audit/readiness all reference the correct package.

## 🟡 Runtime blocks — intentional non-gap

Three blocks are React islands with runtime-driven content, not content-editable via Puck props:

- **AuthModal** — authentication flow (React island, hydrated at runtime)
- **CartDrawer** — cart UI driven by session state
- **CheckoutSection** — payment provider integration (YooKassa/Tochka)

Their Figma mocks are **design reference only**, not gaps to close in this phase.

## 🧭 What's next — Phase 2e

Library is ready. Phase 2e workflow:

1. `pnpm figma:snapshot --theme rose --viewport 1920` — local PNGs already pulled for all 5 themes
2. Open `docs/figma-snapshots/rose/Hero-1920.png` next to the constructor
3. Build the Rose preset through the constructor UI as a tenant would
4. Export → commit to `seed/theme-presets/rose.json`
5. Repeat for Vanilla / Satin / Bloom / Flux
6. Deploy 5 demo sites, prepare stakeholder demo

Per-theme tokens (`packages/theme-{rose,vanilla,satin,bloom,flux}/tokens.json`) already exist and differ correctly:

| | container | radius.button | font.heading |
|-|---|---|---|
| rose | 1280px | 8px | Bitter |
| vanilla | 1320px | 0px | Bitter |
| satin | 1320px | 0px | Kelly Slab |
| bloom | 1320px | 100px (pill) | Urbanist |
| flux | 1320px | 6px | Roboto Flex |

## 📦 Deliverables

Code changes (2 commits in sites sub-repo):
- `scripts/figma/` — audit classification, theme-readiness, composite/plain-text detection
- `packages/theme-base/blocks/Hero/` — grid-4 variant + images array
- `packages/theme-base/blocks/Footer/Footer.classes.ts` — tokenized newsletter radius

Artifacts (regenerated from scripts):
- `docs/078-theme-system/figma-inventory.json` — master map (134 theme × block × viewport entries)
- `docs/078-theme-system/block-coverage-report.md` — per-theme block details
- `docs/078-theme-system/block-gap-summary.md` — deduplicated gaps (0 real, 21 covered, 3 review)
- `docs/078-theme-system/theme-readiness.md` — per-theme scores and capability audit
- `docs/078-theme-system/phase-2d-progress.md` — this file

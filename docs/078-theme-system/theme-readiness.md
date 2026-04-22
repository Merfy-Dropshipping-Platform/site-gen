# Theme Readiness Report

**Figma file:** `QfF9NPZBoQX6vCRg560Qcb` (New Themes)
**Generated:** 2026-04-22T18:21:54.843Z

Per-theme assessment: can we construct this theme's Figma design today using `@merfy/theme-base/blocks/` + tokens from `packages/theme-<name>/tokens.json`?

**Readiness:**
- 🟢 **full** — library expresses all observed Figma features for this block
- 🟡 **partial** — some features supported, some require Phase 2d extension
- 🔴 **gap** — block cannot express required Figma layout/shape yet
- 🔵 **runtime** — React island (AuthModal / CartDrawer / CheckoutSection); Figma is reference, not editable via Puck

## Summary — theme readiness scores

| Theme | Score | Viewports | Full | Partial | Gap | Runtime | Missing in Figma |
|-------|:-----:|-----------|:----:|:-------:|:---:|:-------:|:----------------:|
| **rose** | `██████████` 100% | 1920, 1280, 375 | 🟢 10 | 🟡 0 | 🔴 0 | 🔵 3 | 8 |
| **vanilla** | `██████████` 100% | 1920, 1280, 375 | 🟢 10 | 🟡 0 | 🔴 0 | 🔵 1 | 8 |
| **satin** | `██████████` 100% | 1920, 375 | 🟢 10 | 🟡 0 | 🔴 0 | 🔵 1 | 8 |
| **bloom** | `██████████` 100% | 1920, 1280, 375 | 🟢 10 | 🟡 0 | 🔴 0 | 🔵 1 | 8 |
| **flux** | `██████████` 100% | 1920, 1280, 375 | 🟢 10 | 🟡 0 | 🔴 0 | 🔵 2 | 8 |

---

## ROSE — readiness 100%

**Theme tokens:**

- container max-width: `1280px`
- font heading: `'Bitter', serif`
- font body: `'Arsenal', sans-serif`
- radius.button: `8px`
- radius.card: `10px`
- radius.media: `10px`
- radius.input: `10px`
- color.primary: `#000000`
- color.bg: `#ffffff`
- color.accent: `#000000`

**Viewports in Figma:** 1920, 1280, 375

**Figma → block mapping:** 13 blocks

| Block | Status | Note | Figma hints |
|-------|--------|------|-------------|
| `PromoBanner` | 🟢 full | Library expresses all observed features | — |
| `Header` | 🟢 full | Library expresses all observed features | grid-3col |
| `AuthModal` | 🔵 runtime | Runtime-interactive React island — Figma mock is reference only | — |
| `CheckoutSection` | 🔵 runtime | Runtime-interactive React island — Figma mock is reference only | — |
| `Hero` | 🟢 full | Library expresses all observed features | multi-image (grid/collage) |
| `Collections` | 🟢 full | Library expresses all observed features | grid-3col |
| `Gallery` | 🟢 full | Library expresses all observed features | — |
| `Footer` | 🟢 full | Library expresses all observed features | — |
| `Product` | 🟢 full | Library expresses all observed features | grid-3col |
| `CartDrawer` | 🔵 runtime | Runtime-interactive React island — Figma mock is reference only | — |
| `MainText` | 🟢 full | Library expresses all observed features | — |
| `Newsletter` | 🟢 full | Library expresses all observed features | has-form |
| `ImageWithText` | 🟢 full | Library expresses all observed features | — |

**Missing from Figma** (not yet designed, but present in library): `CollapsibleSection`, `ContactForm`, `MultiColumns`, `MultiRows`, `PopularProducts`, `Publications`, `Slideshow`, `Video`

---

## VANILLA — readiness 100%

**Theme tokens:**

- container max-width: `1320px`
- font heading: `'Bitter', serif`
- font body: `'Arsenal', sans-serif`
- radius.button: `0px`
- radius.card: `0px`
- radius.media: `0px`
- radius.input: `0px`
- color.primary: `#26311c`
- color.bg: `#eeeeee`
- color.accent: `#3a4530`

**Viewports in Figma:** 1920, 1280, 375

**Figma → block mapping:** 11 blocks

| Block | Status | Note | Figma hints |
|-------|--------|------|-------------|
| `Hero` | 🟢 full | Library expresses all observed features | — |
| `PromoBanner` | 🟢 full | Library expresses all observed features | — |
| `Header` | 🟢 full | Library expresses all observed features | grid-4col |
| `MainText` | 🟢 full | Library expresses all observed features | — |
| `Video` | 🟢 full | Library expresses all observed features | — |
| `Footer` | 🟢 full | Library expresses all observed features | — |
| `Collections` | 🟢 full | Library expresses all observed features | — |
| `Product` | 🟢 full | Library expresses all observed features | multi-image (grid/collage) |
| `CartDrawer` | 🔵 runtime | Runtime-interactive React island — Figma mock is reference only | grid-3col |
| `MultiRows` | 🟢 full | Library expresses all observed features | — |
| `ImageWithText` | 🟢 full | Library expresses all observed features | — |

**Missing from Figma** (not yet designed, but present in library): `CollapsibleSection`, `ContactForm`, `Gallery`, `MultiColumns`, `Newsletter`, `PopularProducts`, `Publications`, `Slideshow`

---

## SATIN — readiness 100%

**Theme tokens:**

- container max-width: `1320px`
- font heading: `'Kelly Slab', serif`
- font body: `'Arsenal', sans-serif`
- radius.button: `0px`
- radius.card: `0px`
- radius.media: `0px`
- radius.input: `0px`
- color.primary: `#000000`
- color.bg: `#ffffff`
- color.accent: `#000000`

**Viewports in Figma:** 1920, 375

**Figma → block mapping:** 11 blocks

| Block | Status | Note | Figma hints |
|-------|--------|------|-------------|
| `Hero` | 🟢 full | Library expresses all observed features | — |
| `ImageWithText` | 🟢 full | Library expresses all observed features | grid-2col |
| `MainText` | 🟢 full | Library expresses all observed features | — |
| `Header` | 🟢 full | Library expresses all observed features | — |
| `PromoBanner` | 🟢 full | Library expresses all observed features | — |
| `Collections` | 🟢 full | Library expresses all observed features | grid-3col |
| `CartDrawer` | 🔵 runtime | Runtime-interactive React island — Figma mock is reference only | — |
| `Product` | 🟢 full | Library expresses all observed features | multi-image (grid/collage) |
| `Publications` | 🟢 full | Library expresses all observed features | — |
| `Footer` | 🟢 full | Library expresses all observed features | — |
| `Newsletter` | 🟢 full | Library expresses all observed features | — |

**Missing from Figma** (not yet designed, but present in library): `CollapsibleSection`, `ContactForm`, `Gallery`, `MultiColumns`, `MultiRows`, `PopularProducts`, `Slideshow`, `Video`

---

## BLOOM — readiness 100%

**Theme tokens:**

- container max-width: `1320px`
- font heading: `'Urbanist', sans-serif`
- font body: `'Inter', sans-serif`
- radius.button: `100px`
- radius.card: `12px`
- radius.media: `12px`
- radius.input: `4px`
- color.primary: `#000000`
- color.bg: `#ffffff`
- color.accent: `#cf7a8b`

**Viewports in Figma:** 1920, 1280, 375

**Figma → block mapping:** 11 blocks

| Block | Status | Note | Figma hints |
|-------|--------|------|-------------|
| `Hero` | 🟢 full | Library expresses all observed features | multi-image (grid/collage); pill (radius≥60) |
| `PromoBanner` | 🟢 full | Library expresses all observed features | — |
| `Header` | 🟢 full | Library expresses all observed features | — |
| `CartDrawer` | 🔵 runtime | Runtime-interactive React island — Figma mock is reference only | — |
| `ImageWithText` | 🟢 full | Library expresses all observed features | — |
| `Collections` | 🟢 full | Library expresses all observed features | — |
| `MainText` | 🟢 full | Library expresses all observed features | pill (radius≥60) |
| `Gallery` | 🟢 full | Library expresses all observed features | — |
| `Product` | 🟢 full | Library expresses all observed features | multi-image (grid/collage); grid-2col; pill (radius≥60) |
| `Footer` | 🟢 full | Library expresses all observed features | pill (radius≥60) |
| `Newsletter` | 🟢 full | Library expresses all observed features | pill (radius≥60) |

**Missing from Figma** (not yet designed, but present in library): `CollapsibleSection`, `ContactForm`, `MultiColumns`, `MultiRows`, `PopularProducts`, `Publications`, `Slideshow`, `Video`

---

## FLUX — readiness 100%

**Theme tokens:**

- container max-width: `1320px`
- font heading: `'Roboto Flex', sans-serif`
- font body: `'Roboto Flex', sans-serif`
- radius.button: `6px`
- radius.card: `12px`
- radius.media: `8px`
- radius.input: `8px`
- color.primary: `#000000`
- color.bg: `#ffffff`
- color.accent: `#fa5109`

**Viewports in Figma:** 1920, 1280, 375

**Figma → block mapping:** 12 blocks

| Block | Status | Note | Figma hints |
|-------|--------|------|-------------|
| `Hero` | 🟢 full | Library expresses all observed features | — |
| `Header` | 🟢 full | Library expresses all observed features | — |
| `PromoBanner` | 🟢 full | Library expresses all observed features | — |
| `Footer` | 🟢 full | Library expresses all observed features | has-form |
| `Newsletter` | 🟢 full | Library expresses all observed features | — |
| `CartDrawer` | 🔵 runtime | Runtime-interactive React island — Figma mock is reference only | — |
| `Product` | 🟢 full | Library expresses all observed features | grid-3col |
| `MainText` | 🟢 full | Library expresses all observed features | grid-2col |
| `Collections` | 🟢 full | Library expresses all observed features | multi-image (grid/collage) |
| `Gallery` | 🟢 full | Library expresses all observed features | — |
| `AuthModal` | 🔵 runtime | Runtime-interactive React island — Figma mock is reference only | has-form |
| `ImageWithText` | 🟢 full | Library expresses all observed features | — |

**Missing from Figma** (not yet designed, but present in library): `CollapsibleSection`, `ContactForm`, `MultiColumns`, `MultiRows`, `PopularProducts`, `Publications`, `Slideshow`, `Video`

---

## What this means for Phase 2e (preset building)

Themes with higher scores are ready for preset construction through the constructor. Lower-score themes will surface real gaps during preset building; those become Phase 2d follow-ups.


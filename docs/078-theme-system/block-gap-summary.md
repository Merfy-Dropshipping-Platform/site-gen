# Block Gap Summary — Phase 2c → input for Phase 2d

**Generated:** 2026-04-22T18:21:30.908Z

This is the de-duplicated list of block gaps — every unique variant hint that appears in Figma but is **not a known variant in code**. Each gap is a suggested task for Phase 2d.

## AuthModal

**Code variants today:** —
**Existing capabilities:** form capability; radius tokens (--radius-input,--radius-button)

| Figma hint | Themes | Status | Note | Action |
|------------|--------|--------|------|--------|
| has-form | flux | 🟢 covered (props) | Block already supports embedded form (newsletter.enabled, form prop, or similar). | No code change — enable the form flag in preset. |

## CartDrawer

**Code variants today:** —
**Existing capabilities:** radius tokens (--radius-button)

| Figma hint | Themes | Status | Note | Action |
|------------|--------|--------|------|--------|
| multi-image (grid/collage) | rose, satin | 🟡 review | Block only accepts a single image shape. (runtime-interactive block — typically not extended via Puck props) | No Phase 2d change expected. Figma mock is reference only. |
| grid-3col | bloom, vanilla | 🟡 review | Block has a fixed layout with no columns/array control. (runtime-interactive block — typically not extended via Puck props) | No Phase 2d change expected. Figma mock is reference only. |
| has-form | flux | 🟡 review | No form-shaped props on the block. (runtime-interactive block — typically not extended via Puck props) | No Phase 2d change expected. Figma mock is reference only. |

## Collections

**Code variants today:** —
**Existing capabilities:** columns prop; multi-image (collections); radius tokens (--radius-card,--radius-media)

| Figma hint | Themes | Status | Note | Action |
|------------|--------|--------|------|--------|
| multi-image (grid/collage) | flux, rose, vanilla | 🟢 covered (props) | Block already exposes array/multi-image prop (collections). | No code change — Figma multi-image is expressible via existing array prop. |
| grid-3col | rose, satin | 🟢 covered (props) | Block has numeric `columns` prop — any grid-Ncol is achievable. | No code change — set preset `columns` to required value in Phase 2e. |
| grid-2col | satin | 🟢 covered (props) | Block has numeric `columns` prop — any grid-Ncol is achievable. | No code change — set preset `columns` to required value in Phase 2e. |
| pill (radius≥60) | bloom | 🟢 covered (tokens) | Block reads radius via CSS tokens (--radius-card, --radius-media). Per-theme tokens.json controls corner style. | No code change — set the theme's radius token to desired value. |

## Footer

**Code variants today:** —
**Existing capabilities:** form capability; radius tokens (--radius-input)

| Figma hint | Themes | Status | Note | Action |
|------------|--------|--------|------|--------|
| has-form | flux | 🟢 covered (props) | Block already supports embedded form (newsletter.enabled, form prop, or similar). | No code change — enable the form flag in preset. |
| pill (radius≥60) | bloom | 🟢 covered (tokens) | Block reads radius via CSS tokens (--radius-input). Per-theme tokens.json controls corner style. | No code change — set the theme's radius token to desired value. |

## Header

**Code variants today:** —
**Existing capabilities:** —

| Figma hint | Themes | Status | Note | Action |
|------------|--------|--------|------|--------|
| grid-2col | flux, rose | 🟢 covered (props) | Block uses array-typed props (submenu, navigationLinks); layout derives from items. | No code change — adjust preset data. |
| grid-3col | rose, vanilla | 🟢 covered (props) | Block uses array-typed props (submenu, navigationLinks); layout derives from items. | No code change — adjust preset data. |
| grid-4col | bloom, flux, satin, vanilla | 🟢 covered (props) | Block uses array-typed props (submenu, navigationLinks); layout derives from items. | No code change — adjust preset data. |

## Hero

**Code variants today:** centered, split, overlay, grid-4
**Existing capabilities:** multi-image (images); radius tokens (--radius-button,--radius-media)

| Figma hint | Themes | Status | Note | Action |
|------------|--------|--------|------|--------|
| multi-image (grid/collage) | bloom, rose | 🟢 covered (props) | Block already exposes array/multi-image prop (images). | No code change — Figma multi-image is expressible via existing array prop. |
| pill (radius≥60) | bloom | 🟢 covered (tokens) | Block reads radius via CSS tokens (--radius-button, --radius-media). Per-theme tokens.json controls corner style. | No code change — set the theme's radius token to desired value. |

## ImageWithText

**Code variants today:** —
**Existing capabilities:** radius tokens (--radius-media,--radius-button)

| Figma hint | Themes | Status | Note | Action |
|------------|--------|--------|------|--------|
| grid-2col | satin | 🟢 covered (props) | Block template has composite multi-section layout built-in (e.g., Product gallery+info, ImageWithText). | No code change — layout is fixed by template. |

## MainText

**Code variants today:** —
**Existing capabilities:** —

| Figma hint | Themes | Status | Note | Action |
|------------|--------|--------|------|--------|
| pill (radius≥60) | bloom | 🟢 covered (props) | Block is a plain text container — no images/grid/buttons. Hint is Figma adjacency artifact. | No code change — hint does not apply to this block. |
| grid-2col | flux | 🟢 covered (props) | Block is a plain text container — no images/grid/buttons. Hint is Figma adjacency artifact. | No code change — hint does not apply to this block. |

## Newsletter

**Code variants today:** —
**Existing capabilities:** form capability; radius tokens (--radius-input,--radius-button)

| Figma hint | Themes | Status | Note | Action |
|------------|--------|--------|------|--------|
| has-form | flux, rose | 🟢 covered (props) | Block already supports embedded form (newsletter.enabled, form prop, or similar). | No code change — enable the form flag in preset. |
| pill (radius≥60) | bloom | 🟢 covered (tokens) | Block reads radius via CSS tokens (--radius-input, --radius-button). Per-theme tokens.json controls corner style. | No code change — set the theme's radius token to desired value. |

## Product

**Code variants today:** —
**Existing capabilities:** radius tokens (--radius-media,--radius-button)

| Figma hint | Themes | Status | Note | Action |
|------------|--------|--------|------|--------|
| multi-image (grid/collage) | bloom, rose, satin, vanilla | 🟢 covered (props) | Block template already renders multiple images (gallery/thumbnails baked in). | No code change — template handles multi-image internally. |
| grid-3col | flux, rose | 🟢 covered (props) | Block template has composite multi-section layout built-in (e.g., Product gallery+info, ImageWithText). | No code change — layout is fixed by template. |
| grid-2col | bloom | 🟢 covered (props) | Block template has composite multi-section layout built-in (e.g., Product gallery+info, ImageWithText). | No code change — layout is fixed by template. |
| pill (radius≥60) | bloom | 🟢 covered (tokens) | Block reads radius via CSS tokens (--radius-media, --radius-button). Per-theme tokens.json controls corner style. | No code change — set the theme's radius token to desired value. |

## Intentionally not in Figma (no gap)

These blocks are runtime/backend-only and rarely rendered in Figma:

- `AccountLayout`
- `CartSection`
- `CheckoutHeader`
- `CheckoutLayout`

## Design-pending blocks (missing in Figma, not backend-only)

| Block | Missing in themes | Action |
|-------|-------------------|--------|
| `AuthModal` | vanilla, satin, bloom | Partial coverage — OK if optional, else design-pending for missing themes |
| `CheckoutSection` | vanilla, satin, bloom, flux | Partial coverage — OK if optional, else design-pending for missing themes |
| `CollapsibleSection` | all 5 | Not in Figma — decide: design-pending, skip, or implement token-only from base |
| `ContactForm` | all 5 | Not in Figma — decide: design-pending, skip, or implement token-only from base |
| `Gallery` | vanilla, satin | Partial coverage — OK if optional, else design-pending for missing themes |
| `MultiColumns` | all 5 | Not in Figma — decide: design-pending, skip, or implement token-only from base |
| `MultiRows` | rose, satin, bloom, flux | Partial coverage — OK if optional, else design-pending for missing themes |
| `Newsletter` | vanilla | Partial coverage — OK if optional, else design-pending for missing themes |
| `PopularProducts` | all 5 | Not in Figma — decide: design-pending, skip, or implement token-only from base |
| `Publications` | rose, vanilla, bloom, flux | Partial coverage — OK if optional, else design-pending for missing themes |
| `Slideshow` | all 5 | Not in Figma — decide: design-pending, skip, or implement token-only from base |
| `Video` | rose, satin, bloom, flux | Partial coverage — OK if optional, else design-pending for missing themes |


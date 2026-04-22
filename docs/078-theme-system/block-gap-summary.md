# Block Gap Summary — Phase 2c → input for Phase 2d

**Generated:** 2026-04-22T17:25:33.463Z

This is the de-duplicated list of block gaps — every unique variant hint that appears in Figma but is **not a known variant in code**. Each gap is a suggested task for Phase 2d.

## AuthModal

**Code variants today:** —

| Figma hint | Themes | Likely action |
|------------|--------|---------------|
| has-form | flux, rose | Ensure block supports embedded form fields (Newsletter/ContactForm variants) |

## CartDrawer

**Code variants today:** —

| Figma hint | Themes | Likely action |
|------------|--------|---------------|
| has-form | flux, rose | Ensure block supports embedded form fields (Newsletter/ContactForm variants) |
| multi-image (grid/collage) | rose, satin | Add `images: string[]` prop (array) + variant |
| grid-3col | bloom, vanila | Add variant with grid-3col layout |

## CheckoutSection

**Code variants today:** —

| Figma hint | Themes | Likely action |
|------------|--------|---------------|
| has-form | rose | Ensure block supports embedded form fields (Newsletter/ContactForm variants) |

## Collections

**Code variants today:** —

| Figma hint | Themes | Likely action |
|------------|--------|---------------|
| multi-image (grid/collage) | flux, rose, vanila | Add `images: string[]` prop (array) + variant |
| grid-3col | rose, satin | Add variant with grid-3col layout |
| grid-2col | satin | Add variant with grid-2col layout |
| pill (radius≥60) | bloom | Add style-layer override or variant with radius≥60 for CTAs |

## Footer

**Code variants today:** —

| Figma hint | Themes | Likely action |
|------------|--------|---------------|
| has-form | bloom, flux, rose, satin, vanila | Ensure block supports embedded form fields (Newsletter/ContactForm variants) |
| pill (radius≥60) | bloom | Add style-layer override or variant with radius≥60 for CTAs |

## Gallery

**Code variants today:** —

| Figma hint | Themes | Likely action |
|------------|--------|---------------|
| has-form | flux | Ensure block supports embedded form fields (Newsletter/ContactForm variants) |

## Header

**Code variants today:** —

| Figma hint | Themes | Likely action |
|------------|--------|---------------|
| grid-2col | flux, rose | Add variant with grid-2col layout |
| grid-3col | rose, vanila | Add variant with grid-3col layout |
| grid-4col | bloom, flux, satin, vanila | Add variant with grid-4col layout |

## Hero

**Code variants today:** centered, split, overlay

| Figma hint | Themes | Likely action |
|------------|--------|---------------|
| multi-image (grid/collage) | bloom, rose | Add `images: string[]` prop (array) + variant |
| has-form | bloom, rose | Ensure block supports embedded form fields (Newsletter/ContactForm variants) |
| pill (radius≥60) | bloom | Add style-layer override or variant with radius≥60 for CTAs |

## ImageWithText

**Code variants today:** —

| Figma hint | Themes | Likely action |
|------------|--------|---------------|
| grid-2col | satin | Add variant with grid-2col layout |

## MainText

**Code variants today:** —

| Figma hint | Themes | Likely action |
|------------|--------|---------------|
| pill (radius≥60) | bloom | Add style-layer override or variant with radius≥60 for CTAs |
| has-form | flux | Ensure block supports embedded form fields (Newsletter/ContactForm variants) |
| grid-2col | flux | Add variant with grid-2col layout |

## Newsletter

**Code variants today:** —

| Figma hint | Themes | Likely action |
|------------|--------|---------------|
| has-form | bloom, flux, rose, satin | Ensure block supports embedded form fields (Newsletter/ContactForm variants) |
| pill (radius≥60) | bloom | Add style-layer override or variant with radius≥60 for CTAs |

## Product

**Code variants today:** —

| Figma hint | Themes | Likely action |
|------------|--------|---------------|
| multi-image (grid/collage) | bloom, rose, satin, vanila | Add `images: string[]` prop (array) + variant |
| has-form | rose, vanila | Ensure block supports embedded form fields (Newsletter/ContactForm variants) |
| grid-3col | flux, rose | Add variant with grid-3col layout |
| grid-2col | bloom | Add variant with grid-2col layout |
| pill (radius≥60) | bloom | Add style-layer override or variant with radius≥60 for CTAs |

## Intentionally not in Figma (no gap)

These blocks are runtime/backend-only and rarely rendered in Figma:

- `AccountLayout`
- `CartSection`
- `CheckoutHeader`
- `CheckoutLayout`

## Design-pending blocks (missing in Figma, not backend-only)

| Block | Missing in themes | Action |
|-------|-------------------|--------|
| `AuthModal` | vanila, satin, bloom | Partial coverage — OK if optional, else design-pending for missing themes |
| `CheckoutSection` | vanila, satin, bloom, flux | Partial coverage — OK if optional, else design-pending for missing themes |
| `CollapsibleSection` | all 5 | Not in Figma — decide: design-pending, skip, or implement token-only from base |
| `ContactForm` | all 5 | Not in Figma — decide: design-pending, skip, or implement token-only from base |
| `Gallery` | vanila, satin | Partial coverage — OK if optional, else design-pending for missing themes |
| `MultiColumns` | all 5 | Not in Figma — decide: design-pending, skip, or implement token-only from base |
| `MultiRows` | rose, satin, bloom, flux | Partial coverage — OK if optional, else design-pending for missing themes |
| `Newsletter` | vanila | Partial coverage — OK if optional, else design-pending for missing themes |
| `PopularProducts` | all 5 | Not in Figma — decide: design-pending, skip, or implement token-only from base |
| `Publications` | rose, vanila, bloom, flux | Partial coverage — OK if optional, else design-pending for missing themes |
| `Slideshow` | all 5 | Not in Figma — decide: design-pending, skip, or implement token-only from base |
| `Video` | rose, satin, bloom, flux | Partial coverage — OK if optional, else design-pending for missing themes |


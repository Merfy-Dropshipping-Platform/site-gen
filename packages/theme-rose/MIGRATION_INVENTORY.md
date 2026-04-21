# Rose Migration Inventory

> Scratch document classifying each legacy Rose component for migration into the new `@merfy/theme-rose` package.
> Source: `backend/services/sites/templates/astro/rose/src/components/` (25 `.astro` files + sub-dirs).
> Target: `backend/services/sites/packages/theme-rose/` (cascade on top of `@merfy/theme-base`).

## Summary

| Classification | Count | Meaning |
|----------------|------:|---------|
| **Token-only** | 14 | Use base block + rose `tokens.json` / `defaults` |
| **Variant**    | 3  | Use base block + `blocks.X.variant` in `theme.json` |
| **Override**   | 5  | Rose ships its own 5-file block in `packages/theme-rose/blocks/` |
| **Custom**     | 2  | Rose-only block via `customBlocks/` |
| **Helper**     | 6  | Not a top-level block — sub-components used by overrides |

## Decision heuristics (used below)

- Same props, color/font/radius differences only → **Token-only**
- Same props, different layout arrangement → **Variant** (added to base `X.variants.ts` in future) — for now we will declare variant in theme.json even if base variant list is not yet extended (Phase 2 adds real variant code).
- Extra props, unique markup structure → **Override**
- No base equivalent → **Custom** (registered via `customBlocks`) or **Helper** (internal, no Puck exposure).

## Block-by-block classification

| Rose file | Base equivalent | Classification | Decision | Notes |
|-----------|-----------------|----------------|----------|-------|
| `Hero.astro` | `blocks/Hero` | Token-only | base + rose tokens | Props shape differs (uses `heading.size`, `text.content`, `primaryButton.link.href`) — base migration adapter needed, but visual identity comes from tokens (Bitter/Arsenal + pink palette). ✓ VERIFIED by reading both files. |
| `Header.astro` | `blocks/Header` | Override | `theme-rose/blocks/Header` | 34 KB of markup with rose-specific dropdown, center-aligned logo, custom search/cart/profile SVGs, burger menu, auth modal integration. Base Header is ~80 lines, rose Header is ~900 lines. ✓ VERIFIED. |
| `Footer.astro` | `blocks/Footer` | Override | `theme-rose/blocks/Footer` | Uses 3-column grid (`nav`, `info`, `social`) + `FooterColumn`/`FooterLink`/`SocialIcon` helpers. Base Footer uses 2-part layout (logo+nav LEFT, contact+social RIGHT). Reason to override: `reason: "Rose uses 3-column grid with unique social icons and platform SVGs"`. ✓ VERIFIED. |
| `Collections.astro` | `blocks/Collections` | Token-only | base + tokens | Rose has richer styling (titleSize/subtitleSize/imageView/aspect) but base supports comparable props. Rose-specific pink hue + uppercase Bitter headings → tokens only. ✓ VERIFIED. |
| `PopularProducts.astro` | `blocks/PopularProducts` | Token-only | base + tokens | TBD verify — assume token-only pending diff. |
| `ProductGrid.astro` | _(no direct base)_ | Custom | `theme-rose/customBlocks/ProductGrid` | Catalog listing. Base has `Product` (single-item view) but not a listing grid — treat as custom. TBD verify whether base actually has this hidden. |
| `Product.astro` | `blocks/Product` | Token-only | base + tokens | Rose has 14 KB — TBD whether token-only really works or this is an override; marked token-only optimistically. |
| `Gallery.astro` | `blocks/Gallery` | Variant | `blocks.Gallery.variant: "portrait"` | Rose uses aspect `430/500`. Variant-level change. |
| `ImageWithText.astro` | `blocks/ImageWithText` | Token-only | base + tokens | TBD verify. |
| `MainText` / `TextBlock.astro` | `blocks/MainText` | Token-only | base + tokens | Rose file is named `TextBlock.astro`; map via migration note. |
| `MultiColumns.astro` | `blocks/MultiColumns` | Token-only | base + tokens | TBD verify. |
| `MultiRows.astro` | `blocks/MultiRows` | Token-only | base + tokens | TBD verify. |
| `CollapsibleSection.astro` | `blocks/CollapsibleSection` | Token-only | base + tokens | TBD verify. |
| `Newsletter.astro` | `blocks/Newsletter` | Variant | `blocks.Newsletter.variant: "wide"` | Rose uses `border rounded-lg` horizontal field with submit arrow. Variant candidate. |
| `ContactForm.astro` | `blocks/ContactForm` | Token-only | base + tokens | TBD verify. |
| `Slideshow.astro` | `blocks/Slideshow` | Token-only | base + tokens | TBD verify. |
| `Video.astro` | `blocks/Video` | Token-only | base + tokens | TBD verify. |
| `Publications.astro` | `blocks/Publications` | Token-only | base + tokens | TBD verify. |
| `CartSection.astro` | `blocks/CartSection` | Token-only | base + tokens | TBD verify. |
| `CheckoutSection.astro` | `blocks/CheckoutSection` | Token-only | base + tokens | 35 KB — likely token-only, rose chrome inherits. TBD verify. |
| `PromoBanner.astro` | `blocks/PromoBanner` | Token-only | base + tokens | TBD verify. |
| `ButtonRow.astro` | `blocks/MultiColumns` (approx) | Variant | `blocks.MultiColumns.variant: "buttons"` | Rose-specific row of buttons — if used only in Hero context, leave as inline. |
| `InteractiveSection.astro` | _(no base)_ | Helper | internal | 624 bytes — likely wrapper, not a block. ✗ UNCERTAIN — TBD verify by reading. |
| `AccountNav.astro` | _(no base)_ | Custom | `theme-rose/customBlocks/AccountNav` | Rose account-page sidebar navigation. Base has `AccountLayout` but not a standalone `AccountNav`. Decision: custom. |
| `auth/*.astro` (AuthShell, AuthInput, AuthButton, AuthOtpInput, etc.) | _(no base Puck block)_ | Helper | internal | Base has `AuthModal` block; rose's `auth/*.astro` files are sub-components for AuthModal override — they live inside the Header override (legacy) or become the basis of a future `theme-rose/blocks/AuthModal/` override. Classification: helper for now. |
| `footer/FooterColumn.astro`, `footer/FooterLink.astro`, `footer/SocialIcon.astro` | _(no base)_ | Helper | internal | Used only by rose Footer override. Will move to `theme-rose/blocks/Footer/_helpers/` or inline on override creation. |
| `header/*.astro` (sub-dir) | _(no base)_ | Helper | internal | Rose header sub-components. Will be subsumed into Header override. |
| `gallery/*.astro` (sub-dir) | _(no base)_ | Helper | internal | Wraps Gallery block; consider absorbing. |
| `astro/*.astro` (sub-dir) | _(no base)_ | Helper | internal | Layout primitives — superseded by theme-base layouts. |
| `shared/*.astro` (sub-dir) | _(no base)_ | Helper | internal | Shared utilities (CollectionCardItem, etc.). |
| `react/*.tsx` | (various) | Islands | keep in rose | React islands are Phase 1c runtime — out of scope for this inventory (compiled separately via constructor/storefront).

## Notes on rose auth flow

`auth/AuthShell.astro`, `AuthInput.astro`, `AuthButton.astro`, `AuthOtpInput.astro` are NOT standalone Puck blocks. They compose a custom auth experience invoked from the Header. Two options:

1. Treat all auth chrome as **override of `AuthModal`** in `theme-rose/blocks/AuthModal/` — combine the sub-files into that block's 5-file layout. Recommended.
2. Leave in base `AuthModal` and ship rose-specific design tokens only.

Decision deferred to Task 5+ — inventory lists as Helper so we do not scaffold a block yet.

## Naming reconciliation

| Rose file | Base name | Action |
|-----------|-----------|--------|
| `TextBlock.astro` | `MainText` | Migration: `migrations.ts` maps `TextBlock` → `MainText` (document in rose block README). |
| `ProductGrid.astro` | _(missing in base)_ | Register as custom block OR lobby to add to base in Phase 2. |
| `InteractiveSection.astro` | _(no equivalent)_ | Examine Phase 2 whether to drop or promote. |

## Action items for Tasks 5–8

- [ ] Task 5: Build `theme-rose/blocks/Header/` override — merge legacy Header + header/ helpers.
- [ ] Task 6: Build `theme-rose/blocks/Footer/` override — merge legacy Footer + footer/ helpers, 3-column grid.
- [ ] Task 7 (optional): Override `theme-rose/blocks/AuthModal/` with merged auth/ helpers.
- [ ] Task 8: Declare variants (Hero: centered-overlay, Newsletter: wide, Collections: masonry) in theme.json.
- [ ] Tasks 9–12: Precompile, verify, resolver wiring.

## Confidence markers

- **✓ VERIFIED** for Hero, Footer, Header, Collections (read both rose + base markup).
- **? INFERRED** for most remaining blocks — classification based on filename parity + legacy size; needs one-pass-verify before Task 5.
- **✗ UNCERTAIN** for InteractiveSection, ProductGrid — require reading in Task 5 prep.

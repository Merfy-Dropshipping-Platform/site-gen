# Vanilla Migration Inventory

> Scratch document classifying each legacy Vanilla component for migration into the new `@merfy/theme-vanilla` package.
> Source: `backend/services/sites/templates/astro/vanilla/src/components/` (24 `.astro` files + sub-dirs).
> Target: `backend/services/sites/packages/theme-vanilla/` (cascade on top of `@merfy/theme-base`).

## Summary

| Classification | Count | Meaning |
|----------------|------:|---------|
| **Token-only** | 17 | Use base block + vanilla `tokens.json` / `defaults` |
| **Variant**    | 0  | None — all visual arrangement differences fall inside token/override scope |
| **Override**   | 2  | Vanilla ships its own 5-file block in `packages/theme-vanilla/blocks/` (Header, Footer) |
| **Custom**     | 2  | Vanilla-only block via `customBlocks/` (ProductGrid, AccountNav) |
| **Helper**     | 3  | Not a top-level block — sub-components used by overrides |

## Design signatures (vs base/rose)

| Dimension | Base | Rose | Vanilla |
|-----------|------|------|---------|
| Container max-width | 1280px | 1920px | **1320px** |
| Radii | 8-10px | 8-10px | **0px (flat, square)** |
| Palette | Neutral b/w/beige | Pink hues | **Olive-green (4 schemes)** |
| Heading font | Bitter | Bitter | Bitter (italic emphasis) |
| Body font | Arsenal | Arsenal | Arsenal |
| Footer layout | 2-part | 3-column | 2-part + powered-by bar |
| Cart badge font | Bitter | Bitter | **Exo 2** |
| Powered-by bar | None | None | **Yes — black strip at bottom** |

## Decision heuristics (used below)

- Same props, color/font/radius differences only → **Token-only**
- Same props, different layout arrangement → **Variant**
- Extra props, unique markup structure → **Override**
- No base equivalent → **Custom** (registered via `customBlocks`) or **Helper** (internal, no Puck exposure).

## Block-by-block classification

| Vanilla file | Base equivalent | Classification | Decision | Notes |
|--------------|-----------------|----------------|----------|-------|
| `Header.astro` (629 lines) | `blocks/Header` | Override | `theme-vanilla/blocks/Header` | 4 logo positions (top-left/center/right/center-left), `isLightColor()` logo-invert logic, Exo-2 font cart badge, `header/NavLink.astro` helper, `max-w-[1320px]`, gap-40px. Base Header is ~80 lines. ✓ VERIFIED. |
| `Footer.astro` (149 lines) | `blocks/Footer` | Override | `theme-vanilla/blocks/Footer` | 2-column top row (logo+nav LEFT / contact+social+payment RIGHT) + copyright bar with information links + **powered-by black bar** (unique to Vanilla). Payment method badges MC/VISA/МИР. Base Footer is 2-part but lacks powered-by bar and payment badges. ✓ VERIFIED. |
| `Hero.astro` (234 lines) | `blocks/Hero` | Token-only | base + vanilla tokens | Same prop shape, vanilla styling via tokens. Olive palette + flat buttons come from `tokens.json`. |
| `Collections.astro` (90 lines) | `blocks/Collections` | Token-only | base + tokens | Standard grid; tokens handle colors/radii. |
| `PopularProducts.astro` (163 lines) | `blocks/PopularProducts` | Token-only | base + tokens | TBD verify — assume token-only pending diff. |
| `ProductGrid.astro` (257 lines) | _(no direct base)_ | Custom | `theme-vanilla/customBlocks/ProductGrid` | Catalog listing. Base has `Product` (single-item view) but not a listing grid. Mirror Rose decision. |
| `Product.astro` (278 lines) | `blocks/Product` | Token-only | base + tokens | TBD — marked token-only for parity with Rose. |
| `Gallery.astro` (97 lines) | `blocks/Gallery` | Token-only | base + tokens | Standard grid; tokens handle radii=0. |
| `ImageWithText.astro` (164 lines) | `blocks/ImageWithText` | Token-only | base + tokens | TBD verify. |
| `MultiColumns.astro` (87 lines) | `blocks/MultiColumns` | Token-only | base + tokens | TBD verify. |
| `MultiRows.astro` (100 lines) | `blocks/MultiRows` | Token-only | base + tokens | TBD verify. |
| `CollapsibleSection.astro` (63 lines) | `blocks/CollapsibleSection` | Token-only | base + tokens | TBD verify. |
| `Newsletter.astro` (134 lines) | `blocks/Newsletter` | Token-only | base + tokens | Vanilla uses square inputs+buttons — radii=0 tokens handle this. |
| `ContactForm.astro` (121 lines) | `blocks/ContactForm` | Token-only | base + tokens | TBD verify. |
| `Slideshow.astro` (236 lines) | `blocks/Slideshow` | Token-only | base + tokens | TBD verify. |
| `Video.astro` (163 lines) | `blocks/Video` | Token-only | base + tokens | TBD verify. |
| `Publications.astro` (115 lines) | `blocks/Publications` | Token-only | base + tokens | TBD verify. |
| `CartSection.astro` (58 lines) | `blocks/CartSection` | Token-only | base + tokens | TBD verify. |
| `CheckoutSection.astro` (1033 lines) | `blocks/CheckoutSection` | Token-only | base + tokens | Large but most content is forms/logic; vanilla chrome inherits. TBD verify. |
| `PromoBanner.astro` (30 lines) | `blocks/PromoBanner` | Token-only | base + tokens | TBD verify. |
| `TextBlock.astro` (66 lines) | `blocks/MainText` | Token-only | base + tokens | Name mismatch like Rose — migration adapter needed. |
| `ButtonRow.astro` (86 lines) | _(no direct base)_ | Helper | internal | Inline buttons row used inside Hero/Sections. Not a Puck block. |
| `InteractiveSection.astro` (18 lines) | _(no base)_ | Helper | internal | Wrapper slot component (18 bytes — not a Puck block). ✓ VERIFIED (read source). |
| `AccountNav.astro` (69 lines) | _(no base)_ | Custom | `theme-vanilla/customBlocks/AccountNav` | Account-page sidebar navigation, mirror Rose. |
| `footer/SocialIcon.astro` | _(no base)_ | Helper | internal | Used only by Vanilla Footer. Absorbed into override. |
| `header/NavLink.astro` | _(no base)_ | Helper | internal | Used only by Vanilla Header. Absorbed into override. |
| `auth/*.astro` | `blocks/AuthModal` (base) | Deferred | use base AuthModal | Same decision as Rose Phase 1d — base AuthModal + vanilla tokens acceptable for Phase 2a. |
| `astro/*.astro`, `gallery/*.astro`, `header/*.astro` (sub-dirs) | _(no base)_ | Helper | internal | Layout primitives / sub-components — superseded by theme-base layouts. |

## Action items for Tasks 5–10 (Phase 2a)

- [x] Task 5: Build `theme-vanilla/blocks/Header/` override — merge legacy Header + header/NavLink helper.
- [x] Task 6: Build `theme-vanilla/blocks/Footer/` override — merge legacy Footer + footer/SocialIcon helper; include powered-by bar.
- [x] Task 7: AuthModal override **DEFERRED** — use base AuthModal for Phase 2a (mirror Rose).
- [x] Task 8: Variant declarations **NONE** for Phase 2a — base defaults + vanilla tokens acceptable.
- [ ] Tasks 9–10: Precompile + verify integration.
- [ ] Tasks 11–13: Resolver wiring + visual snapshots + tag.

## Naming reconciliation

| Vanilla file | Base name | Action |
|--------------|-----------|--------|
| `TextBlock.astro` | `MainText` | Migration: base migrations map `TextBlock` → `MainText`. |
| `ProductGrid.astro` | _(missing in base)_ | Register as custom block (Phase 2a+); out of scope Phase 2a MVP. |
| `InteractiveSection.astro` | _(no equivalent)_ | Drop — it's a generic wrapper, not a Puck block. |

## Phase 2a scope

- **Token-only** blocks → 17 blocks cascade via `tokens.json` + `defaults` in `theme.json`. No code changes.
- **Override** blocks → Header + Footer get dedicated 5-file contract in `packages/theme-vanilla/blocks/`.
- **Custom** blocks (ProductGrid, AccountNav) → DEFERRED to Phase 2a+ follow-up. Base `AccountLayout` covers account scaffolding; catalog listing uses site-wide catalog template.
- **Color schemes** → 4 olive-green palettes from `tokens.css` captured in `theme.json → colorSchemes[]`.

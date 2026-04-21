# Satin Migration Inventory (Phase 2b)

> Migration of legacy `templates/astro/satin/` → `packages/theme-satin/`.
> Approach mirrors Phase 1d (Rose), Phase 2a (Vanilla), and Phase 2b (Bloom).

## Summary

| Classification | Count | Meaning |
|----------------|------:|---------|
| **Token-only** | 22 | Use base block + satin `tokens.json` / `defaults` |
| **Override**   | 2  | Satin ships its own 5-file block (Header, Footer) |
| **Helper**     | 2  | `footer/SocialIcon`, `header/NavLink` (absorbed into overrides) |

## Design signatures (vs base/rose/vanilla/bloom)

| Dimension | Base | Rose | Vanilla | Bloom | Satin |
|-----------|------|------|---------|-------|-------|
| Container max-width | 1280px | 1920px | 1320px | 1320px | **1320px** |
| Radii buttons | 8px | 8px | 0px | 100px | **0px (flat)** |
| Radii cards | 10px | 10px | 0px | 12px | **0px** |
| Palette | neutral | pink | olive | pink | **monochrome b/w** |
| Heading font | Bitter | Bitter | Bitter | Urbanist | **Kelly Slab** |
| Body font | Arsenal | Arsenal | Arsenal | Inter | **Arsenal** |
| Text casing | normal | normal | normal | normal | **UPPERCASE (letters-tracking-0.05em)** |
| Button font | Arsenal | Arsenal | Arsenal | Inter | **Manrope** |
| Footer layout | 2-part | 3-col | 2-part + powered | 2-part + powered | **2-part + powered-by** |

## Legacy state verified

- `templates/astro/satin/src/components/` has 24 `.astro` files.
- `Header.astro` (630 lines) is structurally identical to bloom/vanilla.
- `Footer.astro` (138 lines) differs from bloom only in two class additions:
  - newsletter heading has `uppercase tracking-[0.05em]`
  - newsletter submit button has `uppercase tracking-[0.05em]`
- `tokens.css` (122 lines) with 4 monochrome color schemes.

## Action items

- [x] Task 1 (inventory doc)
- [x] Task 2 (scaffold: package.json, tsconfig.json, jest.config.ts, index.ts)
- [x] Task 3 (tokens.json extracted from legacy tokens.css)
- [x] Task 4 (theme.json manifest)
- [x] Task 5 (Header override — Kelly Slab + Arsenal, square radii)
- [x] Task 6 (Footer override — uppercase tracking on newsletter submit)
- [x] Task 7 (controller wire)
- [x] Task 8 (commit + tag)

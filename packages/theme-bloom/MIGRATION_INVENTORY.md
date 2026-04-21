# Bloom Migration Inventory (Phase 2b)

> Migration of legacy `templates/astro/bloom/` → `packages/theme-bloom/`.
> Approach mirrors Phase 1d (Rose) and Phase 2a (Vanilla).

## Summary

| Classification | Count | Meaning |
|----------------|------:|---------|
| **Token-only** | 22 | Use base block + bloom `tokens.json` / `defaults` |
| **Override**   | 2  | Bloom ships its own 5-file block (Header, Footer) |
| **Helper**     | 2  | Not top-level blocks — sub-components used by overrides (`footer/SocialIcon`, `header/NavLink`) |

## Design signatures (vs base/rose/vanilla)

| Dimension | Base | Rose | Vanilla | Bloom |
|-----------|------|------|---------|-------|
| Container max-width | 1280px | 1920px | 1320px | **1320px** |
| Radii buttons | 8px | 8px | 0px | **100px (pill)** |
| Radii cards | 10px | 10px | 0px | **12px** |
| Palette | neutral | pink hues | olive-green | **pink pastel #CF7A8B / #E38E9F** |
| Heading font | Bitter | Bitter | Bitter | **Urbanist** |
| Body font | Arsenal | Arsenal | Arsenal | **Inter** |
| Footer layout | 2-part | 3-col | 2-part + powered-by | **2-part + powered-by** |

## Legacy state verified

- `templates/astro/bloom/src/components/` has 24 `.astro` files + `__tests__`, `astro`, `footer`, `gallery`, `header`, `react`, `shared` sub-dirs.
- `Header.astro` (630 lines) and `Footer.astro` (138 lines) are nearly identical to vanilla structure (same shape/props), pink + pill-radius tokens dominate visuals.
- `tokens.css` (119 lines) contains 4 color schemes + pink accent palette + Urbanist/Inter fonts.
- Legacy Footer differs from vanilla only in color palette — structure is the same (newsletter + 2-part top + copyright bar + powered-by).

## Action items

- [x] Task 1 (inventory doc)
- [x] Task 2 (scaffold: package.json, tsconfig.json, jest.config.ts, index.ts)
- [x] Task 3 (tokens.json extracted from legacy tokens.css)
- [x] Task 4 (theme.json manifest)
- [x] Task 5 (Header override)
- [x] Task 6 (Footer override)
- [x] Task 7 (controller wire)
- [x] Task 8 (commit + tag)

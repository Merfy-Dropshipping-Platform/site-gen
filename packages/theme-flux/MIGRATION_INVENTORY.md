# Flux Migration Inventory (Phase 2b)

> Migration of legacy `templates/astro/flux/` → `packages/theme-flux/`.
> Approach mirrors Phase 1d (Rose), Phase 2a (Vanilla), Phase 2b (Bloom, Satin).

## Summary

| Classification | Count | Meaning |
|----------------|------:|---------|
| **Token-only** | 22 | Use base block + flux `tokens.json` / `defaults` |
| **Override**   | 2  | Flux ships its own 5-file block (Header, Footer) |
| **Helper**     | 2  | `footer/SocialIcon`, `header/NavLink` (absorbed into overrides) |

## Design signatures (vs base/rose/vanilla/bloom/satin)

| Dimension | Base | Rose | Vanilla | Bloom | Satin | Flux |
|-----------|------|------|---------|-------|-------|------|
| Container max-width | 1280px | 1920px | 1320px | 1320px | 1320px | **1320px** |
| Radii buttons | 8px | 8px | 0px | 100px | 0px | **6px** |
| Radii cards | 10px | 10px | 0px | 12px | 0px | **12px** |
| Palette | neutral | pink | olive | pink | mono | **dark + orange accent #fa5109** |
| Heading font | Bitter | Bitter | Bitter | Urbanist | Kelly Slab | **Roboto Flex** |
| Body font | Arsenal | Arsenal | Arsenal | Inter | Arsenal | **Roboto Flex** |
| Announcement font | Arsenal | Arsenal | Arsenal | Inter | Roboto | **Barlow** |
| Footer layout | 2-part | 3-col | 2-part + powered | 2-part + powered | 2-part + powered | **2-part + powered-by** |

## Legacy state verified

- `templates/astro/flux/src/components/` has 24 `.astro` files.
- `Header.astro` (630 lines) is structurally identical to bloom/vanilla/satin.
- `Footer.astro` (138 lines) is byte-identical to bloom Footer (verified via `diff`).
- `tokens.css` (101 lines) with 4 color schemes (Black, White, Light Gray, Dark).

## Action items

- [x] Task 1 (inventory doc)
- [x] Task 2 (scaffold: package.json, tsconfig.json, jest.config.ts, index.ts)
- [x] Task 3 (tokens.json extracted from legacy tokens.css)
- [x] Task 4 (theme.json manifest)
- [x] Task 5 (Header override — orange accent, 6px buttons, Roboto Flex)
- [x] Task 6 (Footer override — orange palette + powered-by)
- [x] Task 7 (controller wire)
- [x] Task 8 (commit + tag)

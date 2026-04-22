# 078 Theme System — docs

Output artifacts and docs for the 078 theme system refactor.

## Files

| File | Produced by | Purpose |
|------|-------------|---------|
| `figma-inventory.json` | `scripts/figma/inventory.ts` | Master map: `theme × block × viewport → Figma nodeId`. Source of truth for all other tools in Phase 2c. |
| `block-coverage-report.md` | `scripts/figma/audit.ts` | Per-theme detailed coverage: which blocks exist in Figma at which viewports, with extracted features. |
| `block-gap-summary.md` | `scripts/figma/audit.ts` | Deduplicated list of gaps — things Figma requires that `@merfy/theme-base/blocks/` doesn't yet express. **This is the input for Phase 2d.** |

Related plans:
- `specs/078-theme-system-refactor/spec.md` — top-level architecture
- `specs/078-theme-system-refactor/plan-phase-2c-figma-pull-pipeline.md` — tools that produced these files
- `specs/078-theme-system-refactor/plan-phase-2d-pixel-perfect-1920.md` — consumes `block-gap-summary.md`
- `specs/078-theme-system-refactor/plan-phase-2e-responsive.md` — building 5 presets via constructor
- `specs/078-theme-system-refactor/plan-phase-3b-constructor-cutover.md` — DB + admin UX + cutover

## Regenerating

```bash
cd backend/services/sites
# 1. Map Figma → blocks (once per Figma file update)
npx tsx scripts/figma/inventory.ts

# 2. Diff Figma structure vs code (after inventory change or after block config change)
npx tsx scripts/figma/audit.ts

# 3. Download local dev reference PNGs (personal workspace, gitignored)
npx tsx scripts/figma/snapshot.ts --theme rose
```

## Reading the reports

- **`figma-inventory.json`** — start here. Each theme entry lists `blocks` (mapped), `unmapped`
  (frames that didn't match — triage target), `missingBlocks` (in whitelist but not found in Figma).
- **`block-coverage-report.md`** — for each theme, a table of which blocks are in Figma at which
  viewports. Click-through to details per block: `nodeId`, bbox, layout mode, children count,
  primary fill, primary font, corner radii, variant hints.
- **`block-gap-summary.md`** — the Phase 2d punch list. Each row is "this Figma pattern is NOT
  expressible with current block props/variants — consider adding".

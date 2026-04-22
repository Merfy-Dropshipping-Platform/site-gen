# scripts/figma — Phase 2c dev tools

Lightweight Figma helpers. **Dev only** — no CI dependency, no runtime usage.
Figma is read-only reference for the developer. Themes in Merfy are **presets in the DB**, not code packages.

## Prerequisites

- `FIGMA_API_KEY` in `.env.local` (see `.env.local.example`)
- Optionally `FIGMA_FILE_KEY` — defaults to `QfF9NPZBoQX6vCRg560Qcb` (New Themes)
- Read access to the Figma file (Starter plan view seat is sufficient)

## Commands

### `figma:inventory`
Walks the Figma file, maps frames to block whitelist, writes the master map.

```bash
npx tsx scripts/figma/inventory.ts
# produces: docs/078-theme-system/figma-inventory.json
```

Output covers 5 themes × blocks × viewports with node IDs. Safe to re-run — it's idempotent.
Interactive prompts are NOT required; frames that didn't match are written to `unmapped`
for manual triage.

### `figma:audit`
Fetches every inventory-mapped node, extracts surface-level features (layout / fills / typography /
corner radii / column count / variant hints), then diffs against each block's `puckConfig.ts`
to produce a **coverage report** and a **gap summary** — the input for Phase 2d.

```bash
npx tsx scripts/figma/audit.ts
# produces:
#   docs/078-theme-system/block-coverage-report.md   (per-theme detail)
#   docs/078-theme-system/block-gap-summary.md       (deduplicated gaps for Phase 2d)
```

Depends on `figma-inventory.json` from `figma:inventory`.

### `figma:snapshot`
Downloads Figma block PNGs + (optionally) raw variables to a local, gitignored dev folder.
Use this when building presets in Phase 2e — open `docs/figma-snapshots/rose/Hero-1920.png`
next to your constructor window and copy values.

```bash
npx tsx scripts/figma/snapshot.ts --theme rose
npx tsx scripts/figma/snapshot.ts --theme vanila --viewport 1920
npx tsx scripts/figma/snapshot.ts --all
```

Output: `docs/figma-snapshots/<theme>/<Block>-<viewport>.png` + `variables.json`.
This directory is in `.gitignore` — it's your personal workspace.

## Architecture

```
scripts/figma/
├── inventory.ts         CLI — generate figma-inventory.json
├── audit.ts             CLI — generate coverage + gap reports
├── snapshot.ts          CLI — download PNGs/variables locally
└── lib/
    ├── rest-client.ts   fetch wrapper with rate limiter + backoff
    ├── rate-limiter.ts  token bucket (3 req/sec, 5 burst)
    ├── env.ts           .env.local loader (no `dotenv` dep)
    ├── types.ts         Figma API types + inventory schema
    ├── name-mapping.ts  Figma label → block name (ru + en, 80+ entries)
    ├── viewport-detect.ts frame name/bbox → '1920'|'1280'|'375'
    ├── figma-tree-walker.ts DFS yielder over FRAME/SECTION/COMPONENT/INSTANCE
    ├── block-config-reader.ts read packages/theme-base/blocks/<B>.puckConfig.ts
    └── figma-features.ts surface-level feature extraction for audit
```

## When to re-run

- **Figma file changed** → `inventory` + `audit` + (optionally) `snapshot`.
- **Added a block to `@merfy/theme-base`** → `audit` (picks up new block config).
- **Just starting work on a theme in Phase 2e** → `snapshot --theme <t>`.

## Troubleshooting

**"Figma API 400: Render timeout"** — some frames are >20000px tall. `snapshot.ts` requests
one id at a time with scale=1 to avoid this. If still failing, reduce viewport scope or
split across multiple runs.

**"Missing env var: FIGMA_API_KEY"** — copy `.env.local.example` to `.env.local` and fill
in your key. Get it at https://www.figma.com/developers/api#access-tokens (read scope sufficient).

**"getVariableCollections 403"** — Starter-plan file variables may require paid plan.
Non-fatal; `snapshot` continues without `variables.json`. Inspect colors manually from PNG.

# Site Build Pipeline — Dual-Mode Notes

This directory contains the build pipeline for the sites service.

## Pipeline stages

`build.service.ts` orchestrates 7 stages:

```
merge → generate → fetch_data → astro_build → zip → upload → deploy
```

## Dual-mode theme assembly (Phase 3a, flag-gated)

As of theme-system-refactor (branch `078-theme-system-refactor`), the
`generate` stage supports TWO theme sources, controlled by the
`BUILD_USE_NEW_PACKAGES` environment variable:

| Flag value                     | Behavior                                              |
| ------------------------------ | ----------------------------------------------------- |
| unset / `false` (DEFAULT)      | LEGACY: copy `templates/astro/<theme>/` → output dir  |
| `true`                         | NEW: assemble `packages/theme-base/` + `packages/theme-<name>/` |

The switch lives in `scaffold-builder.ts` step 1 and is delegated to
`assemble-from-packages.ts` when enabled.

### Safety properties

- Flag defaults to OFF. Production builds currently use the legacy path.
- An explicit `ScaffoldConfig.templateRoot` ALWAYS wins — tests and callers
  that pass it bypass the flag entirely (escape hatch).
- Missing package directories emit warnings into `generatedFiles` but do NOT
  throw. Monitoring can grep `"[assemble warning]"` entries.
- `BUILD_PIPELINE_ENABLED` (existing) gates the whole new pipeline and is
  independent of `BUILD_USE_NEW_PACKAGES`.

### Assemble flow (flag ON)

1. **Base pass**: copy layouts, seo, styles, and all blocks from
   `packages/theme-base/`.
2. **Theme pass**: overlay blocks, customBlocks, assets, and styles from
   `packages/theme-<name>/`. Theme-level files OVERRIDE base files of the
   same relative path.
3. **Tokens**: generate `src/styles/tokens.css` from `packages/theme-<name>/tokens.json`
   via `generateTokensCssV2()` (design-tokens community-group format).

The remaining scaffold-builder steps (package.json, astro config, page
generation from Puck JSON, merchant token overrides, data.json, extra files)
run UNCHANGED for both flag states.

### Migration plan

- **Phase 3a (this change)**: dual-mode added. Flag default OFF. No production impact.
- **Phase 3b (future)**: enable flag for canary site(s). Monitor output, compare
  artifacts to legacy. Fix any parity gaps in `assemble-from-packages.ts`
  (see `PHASE3A-STATUS` markers inline).
- **Phase 3c (future)**: flip default to ON in Coolify env after canary passes.
- **Phase 3d (future)**: delete `templates/astro/*` and the legacy branch in
  `scaffold-builder.ts`.

### Current Phase 3a implementation status

See `PHASE3A-STATUS` comments in `assemble-from-packages.ts`. Summary:

- `copyBaseLayouts`, `copyBaseSeo`, `copyBlocksFromPackage`,
  `copyCustomBlocks`, `copyAssets`, `copyStyles`: **implemented**
- `generateTokensCssV2`: **minimal** — flat-emits all tokens.json keys as
  `--group-subkey: value;`. Full color-scheme variant support defers to
  `tokens-generator.ts::generateTokensCss` (already used by step 7 of
  `buildScaffold` with merchantSettings).
- No import-path rewriting for blocks (Astro components) — assumes the
  existing relative-import conventions of the new packages already match
  the output layout (`src/components/X.astro`). Any discrepancies will be
  caught by canary builds in Phase 3b.

### Files touched

- `src/generator/assemble-from-packages.ts` (new)
- `src/generator/scaffold-builder.ts` (flag-gated branch added to step 1)
- `src/generator/__tests__/assemble-from-packages.spec.ts` (new)
- `src/generator/README.md` (this file)

No existing files were deleted. No `BUILD_PIPELINE_ENABLED` logic was
modified. Legacy `templates/astro/*` directories remain intact.

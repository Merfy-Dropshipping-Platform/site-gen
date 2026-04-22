# Theme Presets — Seed

JSON files here are **canonical starting presets** for the 5 Merfy themes.
Each file declares:

- Display metadata (name, slug, description, tags, badge, previews)
- `templateId` — key that build pipeline resolves to `packages/theme-<id>/` overrides
- `tokens` — W3C design tokens (identical shape to `packages/theme-<id>/tokens.json`)
- `content` — full Puck JSON tree (becomes the first `site_revision.data` when a tenant applies the theme)
- `fontsPreload` — Google Fonts families to `<link rel="preload">` in the storefront `<head>`

## Flow

```
seed/theme-presets/*.json      ← committed (this folder)
       ↓ pnpm sites:seed-presets
       ↓ (also runs on service boot)
`theme` table                  ← upsert by id
       ↓ admin picks in "Темы"
       ↓ POST /api/sites/:id/theme/apply { presetId }
`site` row                     ← site.themeId + site.customTokens set
`site_revision` (new)          ← revision.data = preset.content
       ↓ build pipeline
`site.custom_tokens` merged    ← over packages/theme-<id>/tokens.json
Astro build → live site
```

## Editing

Two ways to update a preset:

1. **Regenerate from scratch** — `pnpm sites:generate-seed-presets` re-creates
   all 5 files from `packages/theme-*/tokens.json` + hardcoded sensible defaults.
   Use this only for bootstrapping or a clean reset — it overwrites tenant
   customizations.

2. **Edit through constructor** (Phase 2e preferred flow):
   - Build a site using the preset
   - Customize via constructor UI
   - Dev-mode "Save as preset" → downloads updated JSON
   - Replace the file here, commit

After any change: `pnpm sites:seed-presets` picks up changes on next boot (or
run it manually).

## Schema

See `src/modules/theme-preset/theme-preset.schema.ts` — `ThemePresetSchema`.

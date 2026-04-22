# Codebase Report: Constructor-Theme-Bridge → Tokens-Generator Pipeline (T078)
Generated: 2026-04-16

## Summary

The pipeline has two distinct code paths that serve different purposes:
1. **constructor-theme-bridge.ts** — converts the constructor's live `ThemeSettings` object (from `revision.data.themeSettings`) into `MerchantSettings`. This is the **primary path for all new sites using the visual constructor**.
2. **theme-bridge.ts** — converts a legacy `settingsSchema + overrides` format into `MerchantSettings`. Used only when no constructor ThemeSettings exist.

The `tokens-generator.ts` is the final CSS emitter: it takes `MerchantSettings` + `ThemeDefaults`, merges them, and outputs `:root { }` + `.color-scheme-N { }` CSS blocks written to `override.css` (then appended to `tokens.css`).

**Critical finding**: `vanilla.json` and `rose.json` have NO `themeSettings` key at all. The pipeline would fall through to Path 3 (schema) or produce no merchant overrides for those themes. This means vanilla and rose do NOT drive their tokens.css via the constructor bridge.

---

## Pipeline Flow (verified from build.service.ts:1429–1465)

```
revision.data.themeSettings? (ConstructorThemeSettings)
  → Path 2: constructorThemeToMerchantSettings()   ← used by bloom, satin, flux
  
revision.meta.merchantSettings?
  → Path 1: direct (legacy)
  
params.themeSettingsSchema?.length > 0
  → Path 3: themeSettingsToMerchantSettings()       ← schema-based fallback
  
none of the above
  → no merchant overrides (tokens.css is static)    ← rose, vanilla behave this way
                                                       unless schema is provided
```

scaffold-builder.ts:317 — calls `generateTokensCss(config.merchantSettings, config.themeDefaults)` and appends result to `tokens.css`.

---

## Per-Theme: defaults JSON → tokens.css Alignment

### BLOOM (defaultSchemeIndex: 2 = scheme-3 "White")

The bridge uses scheme at index 2 for `:root` globals.

**Scheme-3 "White" from bloom.json:**
- background: `#ffffff`
- text: `#000000`
- primaryButton.background: `#cf7a8b`
- primaryButton.text: `#ffffff`
- primaryButton.border: `#cf7a8b`
- secondaryButton.background: `#ffffff`

**What bridge generates for :root:**
- `--color-primary`: `#cf7a8b` → RGB `207 122 139`
- `--color-background`: `#ffffff` → `255 255 255`
- `--color-foreground`: `#000000` → `0 0 0`
- `--color-button`: `#cf7a8b` → `207 122 139`
- `--color-button-text`: `#ffffff` → `255 255 255`
- `--color-secondary`: `#ffffff` → `255 255 255`
- `--color-muted`: blend(`#000000`, `#ffffff`, 0.4) = `#666666` → `102 102 102`
- `--color-border`: `#cf7a8b` (from primaryButton.border) → `207 122 139`

**tokens.css :root actual:**
- `--color-primary: 0, 0, 0` ← MISMATCH (tokens.css uses black; bridge sets #cf7a8b)
- `--color-background: 255, 255, 255` ← MATCH
- `--color-foreground: 0, 0, 0` ← MATCH
- `--color-button: 207, 122, 139` ← MATCH
- `--color-button-text: 255, 255, 255` ← MATCH
- `--color-secondary: 207, 122, 139` ← MISMATCH (tokens.css has #CF7A8B; bridge sets #ffffff = secondary button bg)
- `--color-muted: 153, 153, 153` ← MISMATCH (tokens.css has #999; bridge generates #666)
- `--color-border: 217, 217, 217` ← MISMATCH (tokens.css has #D9D9D9; bridge sets #cf7a8b)

**Color scheme classes — bridge vs tokens.css:**

| Scheme | Token | Bridge (from JSON) | tokens.css | Match? |
|--------|-------|--------------------|-----------|--------|
| scheme-1 (.color-scheme-1) | background | #cf7a8b → `207 122 139` | `207 122 139` | ✓ |
| scheme-1 | foreground | #FFFFFF → `255 255 255` | `255 255 255` | ✓ |
| scheme-1 | button | #ffffff → `255 255 255` | `255 255 255` | ✓ |
| scheme-1 | button-text | #cf7a8b → `207 122 139` | `207 122 139` | ✓ |
| scheme-1 | border | #ffffff (primaryButton.border) → `255 255 255` | `227 142 159` | ✗ MISMATCH |
| scheme-1 | muted | blend(#fff,#cf7a8b,0.4) = `#e6c5cb` → `230 197 203` | `245 245 245` | ✗ MISMATCH |
| scheme-2 (.color-scheme-2) | background | #e38e9f → `227 142 159` | `227 142 159` | ✓ |
| scheme-2 | button | #ffffff → `255 255 255` | `255 255 255` | ✓ |
| scheme-2 | button-text | #e38e9f → `227 142 159` | `227 142 159` | ✓ |
| scheme-2 | border | #ffffff (primaryButton.border) | `247 162 179` | ✗ MISMATCH |
| scheme-2 | muted | blend(#fff,#e38e9f,0.4) ≈ `230 210 214` | `245 245 245` | ✗ MISMATCH |
| scheme-3 (.color-scheme-3) | background | #ffffff | `255 255 255` | ✓ |
| scheme-3 | button | #cf7a8b | `207 122 139` | ✓ |
| scheme-3 | border | #cf7a8b (primaryButton.border) | `217 217 217` | ✗ MISMATCH |
| scheme-3 | muted | blend(#000,#fff,0.4) = `#666666` | `153 153 153` | ✗ MISMATCH |
| scheme-4 (.color-scheme-4) | background | #f7f7f9 → `247 247 249` | `247 247 249` | ✓ |
| scheme-4 | button | #cf7a8b | `207 122 139` | ✓ |
| scheme-4 | border | #cf7a8b (primaryButton.border) | `217 217 217` | ✗ MISMATCH |
| scheme-4 | muted | blend(#000,#f7f7f9,0.4) ≈ `#929296` | `153 153 153` | ✗ MISMATCH |

**Summary for Bloom:**
- Background and button/button-text colors: mostly MATCH
- `--color-primary` in :root: MISMATCH (bridge outputs accent color, tokens.css has black)
- `--color-border` in ALL schemes: MISMATCH (bridge uses primaryButton.border #cf7a8b; tokens.css has theme-specific grays)
- `--color-muted` in ALL schemes: MISMATCH (bridge uses 40% blend formula; tokens.css has hardcoded #999/#F5F5F5)
- `--color-secondary` in :root: MISMATCH (bridge uses secondaryButton.background; tokens.css has accent)

---

### SATIN (defaultSchemeIndex: 1 = scheme-2 "White")

Bridge uses scheme at index 1 (scheme-2 "White") for :root.

**Scheme-2 "White" from satin.json:**
- background: `#ffffff`, text: `#000000`
- primaryButton.background: `#000000`, text: `#ffffff`, border: `#000000`

**Bridge :root output:**
- `--color-primary`: `#000000` → `0 0 0`
- `--color-background`: `#ffffff` → `255 255 255`
- `--color-foreground`: `#000000` → `0 0 0`
- `--color-button`: `#000000` → `0 0 0`
- `--color-button-text`: `#ffffff` → `255 255 255`
- `--color-secondary`: `#ffffff` (secondaryButton.bg) → `255 255 255`
- `--color-muted`: blend(#000,#fff,0.4) = `#666666` → `102 102 102`
- `--color-border`: `#000000` (primaryButton.border)

**tokens.css :root:**
- `--color-primary: 0, 0, 0` ← MATCH
- `--color-background: 255, 255, 255` ← MATCH
- `--color-foreground: 0, 0, 0` ← MATCH
- `--color-button: 0, 0, 0` ← MATCH
- `--color-button-text: 255, 255, 255` ← MATCH
- `--color-secondary: 245, 245, 245` ← MISMATCH (bridge: #fff; CSS: #f5f5f5)
- `--color-muted: 153, 153, 153` ← MISMATCH (bridge: #666; CSS: #999)
- `--color-border: 238, 238, 238` ← MISMATCH (bridge: #000; CSS: #eeeeee)

**Scheme class mismatches (key ones):**
- All schemes: `--color-muted` always mismatches (bridge formula vs hardcoded CSS values)
- All schemes: `--color-border` mismatches (bridge uses primaryButton.border; CSS uses theme grays)
- scheme-1 border: bridge=`#ffffff`, CSS=`68 68 68` — MISMATCH
- scheme-3 bg: bridge=`#f5f5f5`, CSS=`245 245 245` — MATCH (numerical match)
- scheme-4 bg: bridge=`#444444` → `68 68 68`, CSS=`68 68 68` — MATCH

---

### FLUX (defaultSchemeIndex: 1 = scheme-2 "White")

Bridge uses scheme at index 1 (scheme-2 "White") for :root.

**Scheme-2 "White" from flux.json:**
- background: `#ffffff`, text: `#000000`
- primaryButton.background: `#fa5109`, text: `#ffffff`, border: `#fa5109`

**Bridge :root output:**
- `--color-primary`: `#fa5109` → `250 81 9`
- `--color-background`: `#ffffff` → `255 255 255`
- `--color-button`: `#fa5109` → `250 81 9`
- `--color-button-text`: `#ffffff` → `255 255 255`
- `--color-secondary`: `#ffffff` (secondaryButton.bg) → `255 255 255`
- `--color-muted`: blend(#000,#fff,0.4) = `#666666` → `102 102 102`
- `--color-border`: `#fa5109` (primaryButton.border) → `250 81 9`

**tokens.css :root:**
- `--color-primary: 0, 0, 0` ← MISMATCH (bridge: orange; CSS: black)
- `--color-button: 250, 81, 9` ← MATCH
- `--color-button-text: 255, 255, 255` ← MATCH
- `--color-secondary: 250, 250, 250` ← MISMATCH (bridge: #fff; CSS: #fafafa)
- `--color-muted: 204, 204, 204` ← MISMATCH (bridge: #666; CSS: #cccccc)
- `--color-border: 245, 245, 245` ← MISMATCH (bridge: orange #fa5109; CSS: #f5f5f5)

**Scheme class alignment (Flux all 4 schemes use #fa5109 button):**
- background and button colors: MATCH across all 4 schemes
- border: always mismatches (bridge outputs orange; CSS has dark grays for dark schemes)
- muted: always mismatches (bridge formula vs CSS hardcoded values)

---

### VANILLA (defaultSchemeIndex: 2 = scheme-3 "Light Gray")

**CRITICAL: vanilla.json has NO `themeSettings` key.** The build pipeline Path 2 never triggers. The tokens.css is the static ground truth — no override.css is generated unless a schema path is configured.

The tokens.css aligns with scheme-3 "Light Gray" as :root default (background `#eeeeee`, foreground `#26311c`), which is consistent with `defaultSchemeIndex: 2` in principle, but the pipeline does NOT use vanilla.json themeSettings at all.

If vanilla gains a `themeSettings` key in the future, bridge would compute:
- `--color-primary`: scheme-3's primaryButton.bg = `#3a4530` (medium olive)
- tokens.css has `--color-primary: 38, 49, 28` (#26311c) ← would MISMATCH

---

### ROSE (defaultSchemeIndex: not present)

**CRITICAL: rose.json has NO `themeSettings` key.** Same as vanilla — pipeline Path 2 does not trigger. tokens.css is purely static.

Additionally, rose.json's `themeSettings` absence means the color schemes in tokens.css (5 schemes including a blue accent scheme-3) are completely independent of any JSON definition. Rose has 5 color scheme classes, while the constructor supports 4 per its ConstructorColorScheme interface.

---

## Consolidated Mismatch Summary

| Theme | Path | :root color-primary | :root color-secondary | :root color-muted | :root color-border | Scheme bg/button |
|-------|------|---------------------|----------------------|-------------------|-------------------|-----------------|
| Bloom | Bridge | MISMATCH (pink vs black) | MISMATCH | MISMATCH (formula vs #999) | MISMATCH (accent vs gray) | bg/button MATCH |
| Satin | Bridge | MATCH | MISMATCH (#fff vs #f5f5f5) | MISMATCH (#666 vs #999) | MISMATCH (#000 vs #eee) | bg/button MATCH |
| Flux  | Bridge | MISMATCH (orange vs black) | MISMATCH | MISMATCH (#666 vs #ccc) | MISMATCH (orange vs #f5f5f5) | bg/button MATCH |
| Vanilla | None | N/A (no themeSettings) | N/A | N/A | N/A | N/A (static CSS) |
| Rose  | None | N/A (no themeSettings) | N/A | N/A | N/A | N/A (static CSS) |

---

## Root Cause Analysis

### Issue 1: `--color-primary` is ambiguous

In `tokens-generator.ts`, `--color-primary` is treated as a color token (contains "primary") and converted to RGB triplet. In `constructor-theme-bridge.ts`, it is set to `primaryButton.background` (the accent color). But tokens.css for Bloom and Flux defines `--color-primary` as black (`0, 0, 0`) — interpreted as the text/heading primary color, not the button accent.

The semantic mismatch: themes use `--color-primary` for text/heading foreground; the bridge maps it to the primary button background color.

### Issue 2: `--color-border` computed incorrectly

The bridge sets `--color-border` to `primaryButton.border ?? blend(text, bg, 0.2)`. But tokens.css for all themes uses subtle neutral grays for borders that are independent of button accent colors. When primaryButton.border is the accent color (#cf7a8b for bloom, #fa5109 for flux), the bridge overrides borders with bright accent colors.

### Issue 3: `--color-muted` formula mismatch

Bridge computes muted as `blend(text, background, 0.4)` — e.g., 40% black on white = #666666 = `102 102 102`. But tokens.css files use:
- Bloom: `153 153 153` (#999) for dark-bg schemes, `245 245 245` for light-bg schemes
- Satin: `153 153 153` and `200 200 200`
- Flux: `153 153 153` and `204 204 204`
- Vanilla: `68 68 68` and `200 200 200`

The formula gives different values from the hand-crafted Figma values.

### Issue 4: `--color-secondary` semantic mismatch

Bridge sets `:root --color-secondary` to `secondaryButton.background`. But tokens.css defines `--color-secondary` as an accent variant or surface color:
- Bloom tokens.css: `207 122 139` (the brand pink) — but bridge sets it to `#ffffff` (white button bg from scheme-3)
- Satin tokens.css: `245 245 245` (light gray surface) — bridge sets `#ffffff`
- Flux tokens.css: `250 250 250` (#fafafa) — bridge sets `#ffffff`

### Issue 5: Vanilla and Rose have no themeSettings in defaults JSON

These two themes have no `themeSettings` object in their `.json` defaults, so the constructor bridge never fires for them. Their tokens.css values are authoritative and not overridable via the constructor's color scheme picker unless the JSON is updated.

---

## Whether the Pipeline Produces Correct CSS for Constructor Preview

**For bloom, satin, flux:** The pipeline fires correctly — bridge converts `revision.data.themeSettings`, and `generateTokensCss` appends an `override.css` to `tokens.css`. The background and button colors per-scheme are largely correct. However the `:root` level `--color-primary`, `--color-border`, `--color-muted`, and `--color-secondary` are all wrong relative to what the static tokens.css defines. Since override.css is appended AFTER the static tokens.css, the bridge values WIN, which means:

- Constructor preview will show orange borders on Flux and pink borders on Bloom (instead of neutral grays)
- Muted text will be darker (#666) than Figma (#999)
- color-primary will show as accent color not black on Bloom/Flux

**For vanilla and rose:** The bridge does not fire. The static tokens.css is used as-is. Constructor color picker changes have no effect on the generated CSS unless the defaults JSON is updated to include `themeSettings`.

---

## Key Files

| File | Purpose |
|------|---------|
| `/Users/alexey/projects/merfy/backend/services/sites/src/generator/constructor-theme-bridge.ts` | Main bridge: ConstructorThemeSettings → MerchantSettings |
| `/Users/alexey/projects/merfy/backend/services/sites/src/generator/tokens-generator.ts` | CSS emitter: MerchantSettings + ThemeDefaults → override.css |
| `/Users/alexey/projects/merfy/backend/services/sites/src/generator/theme-bridge.ts` | Legacy bridge: settingsSchema + overrides → MerchantSettings |
| `/Users/alexey/projects/merfy/backend/services/sites/src/generator/build.service.ts` | Orchestrates the 3 paths, line ~1429–1465 |
| `/Users/alexey/projects/merfy/backend/services/sites/src/generator/scaffold-builder.ts` | Calls generateTokensCss and appends to tokens.css, line ~317 |
| `/Users/alexey/projects/merfy/backend/services/sites/src/generator/templates/defaults/bloom.json` | Bloom defaults with themeSettings + colorSchemes |
| `/Users/alexey/projects/merfy/backend/services/sites/src/generator/templates/defaults/satin.json` | Satin defaults with themeSettings |
| `/Users/alexey/projects/merfy/backend/services/sites/src/generator/templates/defaults/flux.json` | Flux defaults with themeSettings |
| `/Users/alexey/projects/merfy/backend/services/sites/src/generator/templates/defaults/vanilla.json` | Vanilla defaults — NO themeSettings key |
| `/Users/alexey/projects/merfy/backend/services/sites/src/generator/templates/defaults/rose.json` | Rose defaults — NO themeSettings key |
| `/Users/alexey/projects/merfy/backend/services/sites/templates/astro/bloom/src/styles/tokens.css` | Bloom static tokens (ground truth for Figma design) |
| `/Users/alexey/projects/merfy/backend/services/sites/templates/astro/satin/src/styles/tokens.css` | Satin static tokens |
| `/Users/alexey/projects/merfy/backend/services/sites/templates/astro/flux/src/styles/tokens.css` | Flux static tokens |
| `/Users/alexey/projects/merfy/backend/services/sites/templates/astro/vanilla/src/styles/tokens.css` | Vanilla static tokens |
| `/Users/alexey/projects/merfy/backend/services/sites/templates/astro/rose/src/styles/tokens.css` | Rose static tokens |

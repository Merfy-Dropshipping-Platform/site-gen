# Codebase Report: Vanilla Theme Color Scheme Flow
Generated: 2026-04-13

## Summary

The Vanilla theme has a **critical key mismatch** bug. `theme.json` stores color schemes under `color_schemes` (top-level, snake_case), but `generator.service.ts` reads `manifest.settings?.colorSchemes` (nested under `settings`, camelCase). The two paths never overlap, so `themeColorSchemes` is **always `undefined`** for the Vanilla theme.

## The Bug: Key Mismatch

### What theme.json has (line 48)
```
/templates/astro/vanilla/theme.json
```
```json
{
  "color_schemes": [          // <-- TOP-LEVEL, snake_case
    { "id": 1, "name": "Dark", "background": "#000000", ... },
    { "id": 2, "name": "Warm brown", "background": "#8b7355", ... },
    ...
  ]
}
```

### What generator.service.ts reads (line 186)
```
/src/generator/generator.service.ts:186
```
```typescript
if (manifest.settings?.colorSchemes) {   // <-- NESTED under settings, camelCase
  themeColorSchemes = manifest.settings.colorSchemes;
}
```

**Result:** `manifest.settings` is `undefined` (no such key), so `themeColorSchemes` is never populated. The warm brown (`#8b7355`) scheme in theme.json is never loaded.

## Full Code Path (verified)

### Stage 1 — generator.service.ts reads theme.json
File: `/src/generator/generator.service.ts`, lines 175–192

```
manifest = JSON.parse(themeJsonRaw)
manifest.features          → read ✓ (key exists)
manifest.settings_schema   → read ✓ (key exists at top level)
manifest.settings?.colorSchemes → read ✗ MISS (key doesn't exist → undefined)
manifest.color_schemes     → NEVER READ
```

`themeColorSchemes` stays `undefined`. Passed to `runBuildPipeline()` as `params.themeColorSchemes = undefined`.

### Stage 2 — build.service.ts resolves merchantSettings
File: `/src/generator/build.service.ts`, lines 1418–1454

Three-path priority chain:
1. `ctx.revisionMeta.merchantSettings` (legacy) — usually absent for new builds
2. Constructor ThemeSettings from `revisionData.themeSettings` — only set if user edited colors in constructor
3. `themeSettingsToMerchantSettings(params.themeSettingsSchema, overrides, params.themeColorSchemes)` — **Path 3 is reached but `params.themeColorSchemes` is `undefined`**

Path 3 call at line 1446:
```typescript
merchantSettings = themeSettingsToMerchantSettings(
  params.themeSettingsSchema,  // populated ✓ (settings_schema key exists in theme.json)
  overrides,                   // {} (no user overrides)
  params.themeColorSchemes,    // undefined ← bug propagates here
);
```

### Stage 3 — theme-bridge.ts themeSettingsToMerchantSettings
File: `/src/generator/theme-bridge.ts`, lines 225–267

```typescript
export function themeSettingsToMerchantSettings(
  settingsSchema,
  overrides,
  colorSchemes?,   // receives undefined
): MerchantSettings {
  // ... token processing from settings_schema (this works)

  let generatorSchemes: GeneratorColorScheme[] | undefined;
  if (colorSchemes && colorSchemes.length > 0) {  // colorSchemes is undefined → skip
    generatorSchemes = ...
  }

  return {
    tokens,
    colorSchemes: generatorSchemes,  // undefined — no .color-scheme-N CSS generated
  };
}
```

### Stage 4 — tokens-generator.ts mergeSettings
File: `/src/generator/tokens-generator.ts`, lines 100–117

```typescript
colorSchemes:
  merchant.colorSchemes && merchant.colorSchemes.length > 0
    ? merchant.colorSchemes   // undefined → goes to defaults
    : defaults.colorSchemes,  // defaults is {} → also undefined
```

### Stage 5 — scaffold-builder.ts writes override.css
File: `/src/generator/scaffold-builder.ts`, lines 316–319

```typescript
if (config.merchantSettings) {
  const tokensCss = generateTokensCss(config.merchantSettings, config.themeDefaults ?? {});
  // tokens-generator's generateColorSchemeClasses([]) → empty string
}
```

No `.color-scheme-N` CSS classes are written into `override.css`.

## Where #3a4530 and #8b7355 might appear

Neither value appears anywhere in the TypeScript source files. They only exist in theme.json (`#8b7355` as scheme 2 "Warm brown" background). Since the scheme is never loaded, neither color makes it into the CSS output.

## Fix

### Option A (minimal — fix the key read in generator.service.ts)

In `/src/generator/generator.service.ts` at line 186, change:
```typescript
// BEFORE (wrong key path):
if (manifest.settings?.colorSchemes) {
  themeColorSchemes = manifest.settings.colorSchemes;
}

// AFTER (matches actual theme.json structure):
if (Array.isArray(manifest.color_schemes)) {
  themeColorSchemes = manifest.color_schemes;
} else if (manifest.settings?.colorSchemes) {
  themeColorSchemes = manifest.settings.colorSchemes;  // keep fallback for old format
}
```

Also need to update `ThemeColorScheme` interface in theme-bridge.ts — the `vanilla/theme.json` schemes have an `id` field (number) and `border` field not present in the interface:
```typescript
export interface ThemeColorScheme {
  id?: string | number;   // add this
  name: string;
  background: string;
  foreground: string;
  primary?: string;
  button?: string;
  buttonText?: string;
  border?: string;         // add this
}
```

And in `themeSettingsToMerchantSettings` (theme-bridge.ts line 246), carry over the `id` from theme.json if present:
```typescript
return {
  id: (scheme as any).id ?? index + 1,  // use theme.json id if available
  label: scheme.name,
  colors,
};
```

### Option B (fix theme.json to match what the code expects)

Rename `color_schemes` to `settings.colorSchemes` in theme.json. This is backwards — the theme.json format should be the source of truth, not the reader.

Option A is correct.

## Architecture Map

```
theme.json (vanilla)
  └─ color_schemes[] (top-level)        ← actual key

generator.service.ts:186
  └─ manifest.settings?.colorSchemes    ← WRONG key → always undefined
  └─ themeColorSchemes = undefined

build.service.ts:1449
  └─ themeSettingsToMerchantSettings(..., params.themeColorSchemes)
     └─ colorSchemes param = undefined

theme-bridge.ts:244-261
  └─ if (colorSchemes && ...) → skipped
  └─ generatorSchemes = undefined

tokens-generator.ts:109-112
  └─ merchant.colorSchemes = undefined → falls to defaults.colorSchemes = undefined
  └─ generateColorSchemeClasses([]) → ""

scaffold-builder.ts:317
  └─ override.css has no .color-scheme-N classes
```

## Key Files

| File | Role | Critical Lines |
|------|------|----------------|
| `templates/astro/vanilla/theme.json` | Color scheme source | 48–81 (`color_schemes` array) |
| `src/generator/generator.service.ts` | Reads theme.json | 186–188 (WRONG key: `manifest.settings?.colorSchemes`) |
| `src/generator/theme-bridge.ts` | Converts schemes to generator format | 244–261 (`themeSettingsToMerchantSettings`) |
| `src/generator/build.service.ts` | Resolves merchantSettings | 1438–1454 (Path 3 with `params.themeColorSchemes`) |
| `src/generator/tokens-generator.ts` | Generates CSS | 109–112 (merge), 170–184 (`.color-scheme-N` classes) |
| `src/generator/scaffold-builder.ts` | Writes override.css | 316–319 |


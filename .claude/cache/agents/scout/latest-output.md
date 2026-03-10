# Codebase Report: Header/Footer Black Background — Color Scheme Diagnosis
Generated: 2026-03-10

## Summary

The Header background is black because it reads `colorScheme` from `site-config.json`, which
points to color scheme objects injected from `themeSettings.colorSchemes`. The matching logic
looks up the scheme by `id` field. The `Footer` uses an entirely different mechanism — CSS
classes like `color-scheme-1` applied to the element. Both paths have failure modes that
result in black.

---

## Root Cause Analysis

### Header.astro — How It Sets Background

File: `templates/astro/rose/src/components/Header.astro`

The Header uses **inline style injection via hex color lookup from site-config.json**:

```
Lines 40-51: Reads colorSchemes array from siteConfig
  const colorSchemes = siteConfig?.colorSchemes ?? [];
  const scheme = colorSchemes.find(s => s.id === colorScheme) || colorSchemes[0];
  const bgColor = scheme?.background ?? null;

Line 67: Applies as inline style
  const headerStyle = bgColor ? `background-color: ${bgColor};` : '';

Line 106: Falls back to CSS class when no bgColor
  !bgColor && 'bg-theme-background'
```

So the Header gets its background from `scheme.background` — a **hex string** like `#ffffff`.
If `bgColor` is null (scheme not found, or colorSchemes is empty), it falls back to
`bg-theme-background`, which maps to `rgb(var(--color-background))` from tokens.css.
The `:root` default in tokens.css is `--color-background: 255, 255, 255` (white).

### Footer.astro — How It Sets Background

File: `templates/astro/rose/src/components/Footer.astro`

The Footer uses **CSS class-based color schemes**:

```
Line 45-46: Converts colorScheme prop to a CSS class
  const schemeClass = colorScheme ? `color-scheme-${colorScheme.replace('scheme-', '')}` : '';

Line 49: Applies class + reads CSS variables
  <footer class={`w-full ${schemeClass}`}
    style="background: rgb(var(--color-background)); color: rgb(var(--color-foreground));">

Line 130: Copyright bar has a HARDCODED black fallback:
  style={copyrightSchemeClass ? `background: rgb(var(--color-background)); ...` : 'background: black; color: white;'}
```

The copyright bar is **always black** if `copyrightColorScheme` prop is missing or empty.
That is a confirmed bug — line 130 hardcodes `background: black; color: white` as the else branch.

### The CSS Class Schemes (tokens.css)

File: `templates/astro/rose/src/styles/tokens.css`

```css
/* scheme-1 = BLACK background */
.color-scheme-1 { --color-background: 0, 0, 0; --color-foreground: 255, 255, 255; }

/* scheme-2 = WHITE background */
.color-scheme-2 { --color-background: 255, 255, 255; --color-foreground: 18, 18, 18; }
```

So if `colorScheme = "scheme-1"` → black background. This is the CSS-variable path used by Footer.

---

## Data Flow: How colorScheme Gets Into Astro

### Pipeline (build.service.ts)

1. `extractSiteConfig()` (lines 820-867) — reads Header/Footer props from Puck revision JSON,
   writes them to `siteConfig.header.colorScheme` and `siteConfig.footer.colorScheme`.

2. Lines 1069-1079 — injects `colorSchemes` array from `revisionData.themeSettings.colorSchemes`
   into `siteConfig.colorSchemes`. This is the ConstructorColorScheme[] array.

3. Line 1186 — writes `siteConfig` to `src/data/site-config.json` as an extraFile in the build.

### What Header.astro Expects in site-config.json

```json
{
  "colorSchemes": [
    { "id": "scheme-1", "background": "#ffffff", "text": "#121212" }
  ],
  "header": {
    "colorScheme": "scheme-1"
  }
}
```

Header does `colorSchemes.find(s => s.id === colorScheme)` and reads `scheme.background` (hex).

### What constructor-theme-bridge.ts Actually Produces

File: `src/generator/constructor-theme-bridge.ts`

The `ConstructorColorScheme` interface has:
```
{ id, name, background, heading, text, primaryButton: { background, text, ... } }
```

So `scheme.background` EXISTS as a hex string on the constructor color scheme objects.
The `id` field is also present (from constructor).

---

## Why Is The Header Black — Possible Failure Modes

### Failure Mode 1: `colorSchemes` not injected into site-config.json

The injection at build.service.ts lines 1069-1079 only runs if:
`constructorThemeForColors?.colorSchemes?.length` is truthy.

If `themeSettings` is missing from `revisionData` AND from `revisionMeta`, then
`siteConfig.colorSchemes` is never set. The template file `src/data/site-config.json` contains:

```json
{ "header": {}, "footer": {} }
```

No `colorSchemes` key. Header then gets `colorSchemes = []`, scheme = null, bgColor = null,
falls back to `bg-theme-background` CSS class → white (correct from tokens.css `:root`).
**So an empty colorSchemes does NOT produce black — it falls back to white.**

### Failure Mode 2: `colorScheme` prop id doesn't match any scheme id

If `header.colorScheme = "scheme-1"` but the colorSchemes array has items with numeric ids
(constructor-theme-bridge.ts line 178: `id: index + 1` — that's a NUMBER, not a string like "scheme-1"),
then `find(s => s.id === "scheme-1")` returns undefined, falls back to `colorSchemes[0]`.

colorSchemes[0] background will be whatever the first constructor scheme is.

### Failure Mode 3: Footer copyright bar is ALWAYS BLACK without copyrightColorScheme

`Footer.astro` line 130:
```astro
style={copyrightSchemeClass ? `background: rgb(var(--color-background)); color: rgb(var(--color-foreground));` : 'background: black; color: white;'}
```

If `copyrightColorScheme` prop is not set (empty string, undefined), `copyrightSchemeClass = ''`
which is falsy → **hardcoded black**. This is an unconditional bug.

### Failure Mode 4: Footer body uses CSS class scheme-1 which is BLACK

If `colorScheme = "scheme-1"` is passed as a prop, Footer adds class `color-scheme-1`:
`tokens.css` line 33-38: `.color-scheme-1 { --color-background: 0, 0, 0; }` = BLACK.

So if the user selected "scheme-1" in the constructor, both Footer body AND copyright bar
will be black, which is by design — scheme-1 is a dark theme.

---

## Key File Locations

| File | Role | Key Lines |
|------|------|-----------|
| `templates/astro/rose/src/components/Header.astro` | Reads `scheme.background` hex from site-config.json colorSchemes | 40-51, 66-71 |
| `templates/astro/rose/src/components/Footer.astro` | Uses CSS class `color-scheme-N` + hardcoded black copyright fallback | 45-46, 49, 130 |
| `templates/astro/rose/src/styles/tokens.css` | Defines `.color-scheme-1` (black) through `.color-scheme-5` | 32-70 |
| `templates/astro/rose/src/data/site-config.json` | Template file with empty header/footer — replaced at build time | all |
| `src/generator/build.service.ts` | Injects colorSchemes into site-config.json; writes extraFiles | 1069-1079, 1186 |
| `src/generator/constructor-theme-bridge.ts` | Converts ConstructorColorScheme to GeneratorColorScheme (id is NUMBER, not "scheme-N") | 176-193 |

---

## The id Mismatch Bug (Most Likely Cause of Wrong Color)

`constructor-theme-bridge.ts` line 178:
```typescript
id: index + 1,   // produces: 1, 2, 3 (numbers)
```

But `build.service.ts` injects the raw `themeSettings.colorSchemes` (not the converted ones) into
`site-config.json` (lines 1073-1075). These are `ConstructorColorScheme` objects which have
string ids from the constructor (e.g., `"scheme-1"`, `"scheme-2"`, etc.).

Header.astro line 42:
```typescript
colorSchemes.find((s: any) => s.id === colorScheme)
```

This compares `s.id` against the `colorScheme` prop value. If the constructor saves scheme ids as
`"scheme-1"` and the prop is `"scheme-1"`, the match WORKS. But if there is any format mismatch,
it falls through to `colorSchemes[0]` — whatever scheme is first.

The **real black background issue** is almost certainly **Footer.astro line 130**: the copyright
bar is hardcoded to `background: black` whenever `copyrightColorScheme` is not provided.


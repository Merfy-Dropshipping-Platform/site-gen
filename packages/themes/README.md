# @merfy/themes

Theme system for Merfy storefronts. Provides theme validation, token generation, component resolution, and CLI tools for theme development.

## Architecture

A theme is a directory containing:

```
my-theme/
  theme.json           # Manifest: name, version, features, settings, pages
  package.json         # Node package metadata
  astro.config.mjs     # Astro build config
  pages/               # Puck JSON page templates (index.json, product.json, ...)
  src/
    styles/
      tokens.css       # CSS custom properties from settings
      global.css       # Base styles + Tailwind
    layouts/
      BaseLayout.astro
      StoreLayout.astro
    components/
      *.astro          # Astro components (SSG)
      react/*.tsx       # React components (Puck preview + islands)
```

## theme.json Manifest

Required fields: `name`, `version`.

```json
{
  "name": "Rose",
  "version": "1.0.0",
  "category": "fashion",
  "description": "Elegant fashion theme",
  "author": "Merfy",
  "features": {
    "variants": true,
    "collections": true,
    "filterSidebar": true,
    "newsletter": true
  },
  "pages": ["index", "product", "collection", "cart"],
  "settings_schema": [
    {
      "name": "Colors",
      "settings": [
        { "id": "color_primary", "type": "color", "label": "Primary", "default": "#e11d48" }
      ]
    }
  ],
  "color_schemes": [
    { "name": "Light", "background": "#ffffff", "foreground": "#121212", "primary": "#e11d48" }
  ]
}
```

### Feature Flags

Boolean feature flags control which components are available. Components can declare `requiredFeatures` -- they are excluded if any required feature is `false` or missing.

### Settings Schema

Groups of merchant-customizable settings. Supported types: `color`, `font`, `range`, `select`, `text`, `checkbox`. Setting IDs map to CSS custom properties (e.g. `color_primary` -> `--color-primary`).

### Color Schemes

Pre-defined color palettes. Each scheme overrides `background`, `foreground`, `primary` (and optionally `button`, `buttonText`).

## CLI Commands

```bash
# Create a new theme (optionally from existing theme)
pnpm theme:create --name MyTheme --category fashion [--from rose]

# Validate theme structure and manifest
pnpm theme:validate --theme my-theme [--dir ./themes]

# Add a component to a theme (creates .astro + .tsx stubs)
pnpm theme:add-component --theme my-theme --name ProductComparison [--island] [--features variants]

# Start dev server (placeholder -- requires Astro Generator)
pnpm theme:dev --theme my-theme [--port 4321]
```

## Library API

### validateTheme(themeDir)

Returns `{ valid: boolean, errors: string[], warnings: string[] }`. Checks:
- theme.json exists and has required fields
- Referenced pages have .json files
- Component registry entries have corresponding files
- tokens.css exists
- settings_schema structure is valid

### loadTheme(themeDir)

Returns `ThemeExport` with manifest, registry, tokens, layout loaders, and page loaders.

### resolveComponents(allComponents, features)

Filters a component registry by feature flags. Components with no `requiredFeatures` are always included.

### generateTokensCss(settingsSchema, colorSchemes, merchantOverrides?)

Generates CSS custom properties from settings defaults and color schemes. Handles hex-to-RGB conversion for alpha support.

## Types

```ts
interface ThemeManifest { id, name, version, description?, author?, features, settings?, pages? }
interface ComponentRegistryEntry { name, label, category, puckConfig, astroTemplate, island?, islandDirective?, schema, requiredFeatures? }
interface ColorScheme { name, background, foreground, primary?, button?, buttonText? }
interface ThemeExport { manifest, registry, tokens, layouts, pages }
type ComponentCategory = "layout" | "hero" | "products" | "content" | "navigation"
type IslandDirective = "load" | "visible" | "idle"
```

## Creating a New Theme

1. `pnpm theme:create --name Minimal --category digital`
2. Edit `theme.json` -- set features, settings, color schemes
3. Create components in `src/components/` (Astro) and `src/components/react/` (React)
4. Define page templates in `pages/*.json` (Puck format)
5. `pnpm theme:validate --theme minimal` to check structure
6. `pnpm theme:dev --theme minimal` to preview

/**
 * Catalog block — token whitelist.
 *
 * All visual styles in Catalog.astro / Catalog.classes.ts MUST consume
 * CSS variables declared here. No hardcoded color/font/spacing literals.
 * Per-theme overrides live in theme-X/tokens.json + theme-X/theme.json.
 */
export const CatalogTokens = {
  colors: [
    '--color-foreground',
    '--color-background',
    '--color-muted',
    '--color-accent',
    '--color-border',
  ],
  fonts: [
    '--font-heading',
    '--font-body',
  ],
  radii: [
    '--radius-button',
    '--radius-card',
  ],
  spacing: [
    '--space-section-padding',
    '--space-grid-gap',
    '--space-sidebar-gap',
    '--space-toolbar-gap',
  ],
  // Sidebar / mobile breakpoints (used by class names and inline media queries)
  breakpoints: {
    lg: 1024,
    sm: 640,
  },
} as const;

export type CatalogTokensType = typeof CatalogTokens;

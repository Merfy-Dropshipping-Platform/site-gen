/**
 * Product block — token whitelist.
 *
 * All visual styles in Product.astro / Product.classes.ts MUST consume
 * CSS variables declared here. No hardcoded color/font/spacing literals.
 * Per-theme overrides live in theme-X/tokens.json + theme-X/theme.json.
 *
 * Aligned with Catalog/rose conventions (--color-foreground/background/muted)
 * after spec 082 product migration. Legacy whitelist (--color-bg/text/heading)
 * is kept here as compat aliases so consuming themes that still emit the older
 * variable names continue to render.
 */
export const ProductTokens = [
  // New (rose/catalog-aligned) — preferred
  '--color-foreground',
  '--color-background',
  '--color-muted',
  '--color-accent',
  '--color-border',
  // Legacy (theme-base default schemes) — fallback
  '--color-bg',
  '--color-surface',
  '--color-heading',
  '--color-text',
  '--color-button-bg',
  '--color-button-text',
  '--color-button-border',
  // Typography & layout
  '--font-heading',
  '--font-body',
  '--size-hero-heading',
  '--size-hero-button-h',
  '--radius-button',
  '--radius-media',
  '--radius-card',
  '--spacing-section-y',
  '--spacing-grid-col-gap',
  '--container-max-width',
] as const satisfies readonly `--${string}`[];

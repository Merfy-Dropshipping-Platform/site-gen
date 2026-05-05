export interface TokenMeta {
  category: 'color' | 'font' | 'weight' | 'size' | 'radius' | 'spacing' | 'variant';
  scope: 'theme' | 'scheme';
  unit?: 'px' | 'rem' | '%';
  min?: number;
  max?: number;
  values?: readonly string[];
}

export const TOKEN_REGISTRY = {
  // Colors — per scheme (RGB triplet values)
  '--color-bg':                { category: 'color', scope: 'scheme' },
  '--color-surface':           { category: 'color', scope: 'scheme' },
  '--color-heading':           { category: 'color', scope: 'scheme' },
  '--color-text':              { category: 'color', scope: 'scheme' },
  '--color-muted':             { category: 'color', scope: 'scheme' },
  '--color-primary':           { category: 'color', scope: 'scheme' },
  '--color-accent':            { category: 'color', scope: 'scheme' },
  '--color-accent-fg':         { category: 'color', scope: 'scheme' },
  '--color-accent-2':          { category: 'color', scope: 'scheme' },
  '--color-button-bg':         { category: 'color', scope: 'scheme' },
  '--color-button-text':       { category: 'color', scope: 'scheme' },
  '--color-button-border':     { category: 'color', scope: 'scheme' },
  '--color-button-2-bg':       { category: 'color', scope: 'scheme' },
  '--color-button-2-text':     { category: 'color', scope: 'scheme' },
  '--color-button-2-border':   { category: 'color', scope: 'scheme' },
  '--color-border':            { category: 'color', scope: 'scheme' },
  '--color-link':              { category: 'color', scope: 'scheme' },
  '--color-input-bg':          { category: 'color', scope: 'scheme' },
  '--color-input-border':      { category: 'color', scope: 'scheme' },
  '--color-input-label':       { category: 'color', scope: 'scheme' },
  '--color-input-placeholder': { category: 'color', scope: 'scheme' },
  '--color-error':             { category: 'color', scope: 'theme' },

  // Typography
  '--font-heading':            { category: 'font',   scope: 'theme' },
  '--font-body':               { category: 'font',   scope: 'theme' },
  '--font-cart-counter':       { category: 'font',   scope: 'theme' },
  '--font-powered-by':         { category: 'font',   scope: 'theme' },
  '--weight-heading':          { category: 'weight', scope: 'theme' },
  '--weight-body':             { category: 'weight', scope: 'theme' },
  '--size-hero-heading':       { category: 'size',   unit: 'px', scope: 'theme' },
  '--slide-min-height':        { category: 'size',   scope: 'theme' },
  '--size-section-heading':    { category: 'size',   unit: 'px', scope: 'theme' },
  '--size-nav-link':           { category: 'size',   unit: 'px', scope: 'theme' },
  '--size-checkout-brand':     { category: 'size',   unit: 'px', scope: 'theme' },
  '--size-checkout-brand-image': { category: 'size', unit: 'px', scope: 'theme' },
  '--size-h2':                 { category: 'size',   unit: 'px', scope: 'theme' },
  '--size-h3':                 { category: 'size',   unit: 'px', scope: 'theme' },
  '--size-body':               { category: 'size',   unit: 'px', scope: 'theme' },
  '--size-small':              { category: 'size',   unit: 'px', scope: 'theme' },
  '--size-tiny':               { category: 'size',   unit: 'px', scope: 'theme' },

  // Radii
  '--radius-button':           { category: 'radius', unit: 'px', scope: 'theme', min: 0, max: 48 },
  '--radius-input':            { category: 'radius', unit: 'px', scope: 'theme', min: 0, max: 48 },
  '--radius-card':             { category: 'radius', unit: 'px', scope: 'theme', min: 0, max: 48 },
  '--radius-media':            { category: 'radius', unit: 'px', scope: 'theme', min: 0, max: 48 },
  '--radius-field':            { category: 'radius', unit: 'px', scope: 'theme' },

  // Spacing
  '--spacing-section-y':       { category: 'spacing', unit: 'px', scope: 'theme', min: 0, max: 160 },
  '--spacing-grid-col-gap':    { category: 'spacing', unit: 'px', scope: 'theme' },
  '--spacing-grid-row-gap':    { category: 'spacing', unit: 'px', scope: 'theme' },

  // Sizes
  '--container-max-width':     { category: 'size', unit: 'px', scope: 'theme' },
  '--size-hero-button-h':      { category: 'size', unit: 'px', scope: 'theme' },
  '--size-newsletter-form-w':  { category: 'size', unit: 'px', scope: 'theme' },
  '--size-logo-width':         { category: 'size', unit: 'px', scope: 'theme' },
  '--size-card-border':        { category: 'size', unit: 'px', scope: 'theme', min: 0, max: 4 },
  '--promo-banner-h-thin':     { category: 'size', unit: 'px', scope: 'theme', min: 0, max: 200 },

  // Theme-scope colors (used by universal blocks across themes)
  '--color-bottom-strip-bg':   { category: 'color', scope: 'theme' },
  '--color-bottom-strip-text': { category: 'color', scope: 'theme' },
  /**
   * 084 vanilla pilot — additive theme-scope token. Header surface colour.
   * Pre-084 themes don't set it, so Header.classes.ts falls back to
   * `--color-bg` (active scheme bg). Vanilla overrides to `58 69 48`
   * (#3a4530) so the header sits as a distinct band above the promo
   * banner (#26311c) — matches Figma 1:18957.
   */
  '--color-header-bg':         { category: 'color', scope: 'theme' },

  // Layout variants (enumerated string tokens)
  '--button-style':            { category: 'variant', values: ['outline', 'solid'], scope: 'theme' },
  '--footer-layout':           { category: 'variant', values: ['2-part', '3-column', 'stacked-center'], scope: 'theme' },
  '--contact-form-layout':     { category: 'variant', values: ['wide', 'narrow'], scope: 'theme' },
  '--cart-type':               { category: 'variant', values: ['drawer', 'page'], scope: 'theme' },
  '--card-style':              { category: 'variant', values: ['standard', 'card'], scope: 'theme' },
  '--card-alignment':          { category: 'variant', values: ['left', 'center', 'right'], scope: 'theme' },
  '--text-transform-heading':  { category: 'variant', values: ['none', 'uppercase', 'capitalize'], scope: 'theme' },
} as const satisfies Record<`--${string}`, TokenMeta>;

export type TokenKey = keyof typeof TOKEN_REGISTRY;

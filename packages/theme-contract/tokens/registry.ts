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
  '--weight-heading':          { category: 'weight', scope: 'theme' },
  '--weight-body':             { category: 'weight', scope: 'theme' },
  '--size-hero-heading':       { category: 'size',   unit: 'px', scope: 'theme' },
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

  // Layout variants (enumerated string tokens)
  '--button-style':            { category: 'variant', values: ['outline', 'solid'], scope: 'theme' },
  '--footer-layout':           { category: 'variant', values: ['2-part', '3-column', 'stacked-center'], scope: 'theme' },
  '--contact-form-layout':     { category: 'variant', values: ['wide', 'narrow'], scope: 'theme' },
  '--cart-type':               { category: 'variant', values: ['drawer', 'page'], scope: 'theme' },
  '--card-style':              { category: 'variant', values: ['standard', 'card'], scope: 'theme' },
  '--card-alignment':          { category: 'variant', values: ['left', 'center', 'right'], scope: 'theme' },
} as const satisfies Record<`--${string}`, TokenMeta>;

export type TokenKey = keyof typeof TOKEN_REGISTRY;

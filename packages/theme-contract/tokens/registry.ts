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
  // Pre-existing глобальные hover-токены — используются в Hero, MultiColumns,
  // Newsletter, ContactForm, PopularProducts, CheckoutSubmit, Catalog,
  // ImageWithText, CartCheckoutButton, MultiRows, Slideshow, ProductActions.
  // Декларированы в CartCheckoutButton.tokens.ts, но не были в registry.
  '--color-button-bg-hover':   { category: 'color', scope: 'scheme' },
  '--color-button-text-hover': { category: 'color', scope: 'scheme' },
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
  // Pre-existing pagination font — используется в Hero.classes.ts:88 для
  // paginationButton (Hero carousel). Fallback в classes — `'Exo_2', sans-serif`,
  // зарегистрировано чтобы пройти validateTokenCompleteness.
  '--font-pagination':         { category: 'font',   scope: 'theme' },
  '--weight-heading':          { category: 'weight', scope: 'theme' },
  '--weight-body':             { category: 'weight', scope: 'theme' },
  '--size-hero-heading':       { category: 'size',   unit: 'px', scope: 'theme' },
  // Pre-existing per-block hero heading size — Hero.astro:89 инжектит
  // inline через style="--hero-heading-size:…" (управляется heading.size
  // в Puck: small/medium/large → calc от --size-hero-heading). В classes
  // используется через text-[length:var(--hero-heading-size,var(--size-hero-heading))].
  '--hero-heading-size':       { category: 'size',   scope: 'theme' },
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
  /**
   * 084 Stage 3 catalog — additive theme-scope tokens. Sidebar width and
   * grid row gap for the Catalog page. Pre-084 themes don't set them so
   * Catalog falls through to base-defaults (260px / 32px). Vanilla
   * theme.json overrides to 294px / 40px per Figma.
   */
  '--catalog-sidebar-w':       { category: 'size',    unit: 'px', scope: 'theme', min: 200, max: 400 },
  '--catalog-grid-row-gap':    { category: 'spacing', unit: 'px', scope: 'theme' },

  // Sizes
  '--container-max-width':     { category: 'size', unit: 'px', scope: 'theme' },
  '--size-hero-button-h':      { category: 'size', unit: 'px', scope: 'theme' },
  '--size-newsletter-form-w':  { category: 'size', unit: 'px', scope: 'theme' },
  '--size-logo-width':         { category: 'size', unit: 'px', scope: 'theme' },
  '--size-card-border':        { category: 'size', unit: 'px', scope: 'theme', min: 0, max: 4 },
  '--promo-banner-h-thin':     { category: 'size', unit: 'px', scope: 'theme', min: 0, max: 200 },
  /**
   * 084 vanilla pilot — additive theme-scope token. Header total height
   * (e.g. vanilla = 80px per Figma 1:18957). Pre-084 themes don't set
   * it so Header.classes.ts falls through to `auto` height.
   */
  '--size-header-h':           { category: 'size', unit: 'px', scope: 'theme', min: 0, max: 240 },

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
  // ── v2 миграция — токены блока (добавлено скриптом)
  '--header-nav-gap': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--header-nav-gap-lg': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--header-logo-link-font-size': { category: 'size', unit: 'px', scope: 'theme' },
  '--header-nav-link-font-size': { category: 'size', unit: 'px', scope: 'theme' },
  '--header-nav-link-padding-bottom': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--header-nav-link-font-size-lg': { category: 'size', unit: 'px', scope: 'theme' },
  '--header-action-search-opacity-hover': { category: 'size', scope: 'theme' },
  '--header-cart-badge-min-width': { category: 'size', unit: 'px', scope: 'theme' },
  '--header-cart-badge-height': { category: 'size', unit: 'px', scope: 'theme' },
  '--header-action-profile-opacity-hover': { category: 'size', scope: 'theme' },
  '--header-mobile-menu-root-width': { category: 'size', scope: 'theme' },
  '--header-mobile-menu-root-background-color': { category: 'color', scope: 'theme' },
  '--header-mobile-menu-root-padding-x': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--header-mobile-menu-root-padding-top': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--header-mobile-menu-root-padding-bottom': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--header-mobile-menu-root-padding-x-sm': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--header-mobile-menu-root-padding-x-md': { category: 'spacing', unit: 'px', scope: 'theme' },
  // ── v2 миграция — токены блока (добавлено скриптом)
  '--footer-container-max-width': { category: 'size', unit: 'px', scope: 'theme' },
  '--footer-container-padding-x-sm': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--footer-container-padding-x-md': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--footer-container-padding-x-lg': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--footer-container-padding-x-xl': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--footer-container-width': { category: 'size', scope: 'theme' },
  '--footer-container-padding-bottom': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--footer-container-padding-top': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--footer-container-padding-x-2xl': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--footer-newsletter-wrapper-width': { category: 'size', scope: 'theme' },
  '--footer-newsletter-wrapper-gap': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--footer-newsletter-copy-max-width': { category: 'size', unit: 'px', scope: 'theme' },
  '--footer-newsletter-copy-text-align': { category: 'size', scope: 'theme' },
  '--footer-newsletter-heading-width': { category: 'size', scope: 'theme' },
  '--footer-newsletter-form-max-width': { category: 'size', unit: 'px', scope: 'theme' },
  '--footer-newsletter-form-height': { category: 'size', unit: 'px', scope: 'theme' },
  '--footer-newsletter-form-border-radius': { category: 'radius', unit: 'px', scope: 'theme' },
  '--footer-newsletter-form-gap': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--footer-newsletter-form-border-color': { category: 'color', scope: 'theme' },
  '--footer-newsletter-form-padding-left': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--footer-newsletter-form-padding-right': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--footer-newsletter-form-border-color-focus-within': { category: 'color', scope: 'theme' },
  '--footer-newsletter-input-font-size': { category: 'size', unit: 'px', scope: 'theme' },
  '--footer-newsletter-submit-font-size': { category: 'size', unit: 'px', scope: 'theme' },
  '--footer-newsletter-submit-transform-active': { category: 'size', scope: 'theme' },
  '--footer-main-section-width': { category: 'size', scope: 'theme' },
  '--footer-main-section-gap': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--footer-main-grid-gap': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--footer-main-grid-gap-sm': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--footer-column-root-gap': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--footer-email-text-align-lg': { category: 'size', scope: 'theme' },
  '--footer-copyright-bar-height': { category: 'size', unit: 'px', scope: 'theme' },
  '--footer-copyright-bar-padding-x': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--footer-copyright-text-font-size': { category: 'size', unit: 'px', scope: 'theme' },
  '--footer-copyright-text-color': { category: 'color', scope: 'theme' },
  // ── v2 миграция — токены блока (добавлено скриптом)
  '--hero-root-background-color': { category: 'color', scope: 'theme' },
  '--hero-stage-width': { category: 'size', scope: 'theme' },
  '--hero-stage-min-height': { category: 'size', scope: 'theme' },
  '--hero-stage-min-height-sm': { category: 'size', unit: 'px', scope: 'theme' },
  '--hero-stage-min-height-md': { category: 'size', unit: 'px', scope: 'theme' },
  '--hero-stage-min-height-lg': { category: 'size', unit: 'px', scope: 'theme' },
  '--hero-overlay-width': { category: 'size', scope: 'theme' },
  '--hero-overlay-padding-x': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--hero-overlay-padding-bottom': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--hero-overlay-padding-top': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--hero-overlay-padding-x-sm': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--hero-overlay-padding-bottom-sm': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--hero-overlay-padding-top-sm': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--hero-overlay-padding-x-md': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--hero-overlay-padding-bottom-md': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--hero-overlay-padding-top-md': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--hero-overlay-padding-x-lg': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--hero-overlay-padding-bottom-lg': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--hero-overlay-padding-x-xl': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--hero-overlay-padding-bottom-xl': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--hero-overlay-padding-x-2xl': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--hero-content-column-gap': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--hero-content-column-gap-sm': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--hero-content-column-max-width': { category: 'size', unit: 'px', scope: 'theme' },
  '--hero-content-column-max-width-md': { category: 'size', unit: 'px', scope: 'theme' },
  '--hero-header-gap': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--hero-header-gap-sm': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--hero-header-gap-md': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--hero-header-text-align': { category: 'size', scope: 'theme' },
  '--hero-subtitle-font-size': { category: 'size', unit: 'px', scope: 'theme' },
  '--hero-subtitle-padding-x': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--hero-subtitle-font-size-sm': { category: 'size', unit: 'px', scope: 'theme' },
  '--hero-subtitle-font-size-md': { category: 'size', unit: 'px', scope: 'theme' },
  '--hero-subtitle-font-size-lg': { category: 'size', unit: 'px', scope: 'theme' },
  '--hero-cta-button-height': { category: 'size', unit: 'px', scope: 'theme' },
  '--hero-cta-button-border-radius': { category: 'radius', unit: 'px', scope: 'theme' },
  '--hero-cta-button-padding-x': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--hero-cta-button-font-size': { category: 'size', unit: 'px', scope: 'theme' },
  '--hero-cta-button-min-height': { category: 'size', unit: 'px', scope: 'theme' },
  '--hero-cta-button-min-width': { category: 'size', unit: 'px', scope: 'theme' },
  '--hero-cta-button-opacity-hover': { category: 'size', scope: 'theme' },
  '--hero-cta-button-height-sm': { category: 'size', unit: 'px', scope: 'theme' },
  '--hero-cta-button-min-height-sm': { category: 'size', unit: 'px', scope: 'theme' },
  '--hero-cta-button-min-width-sm': { category: 'size', unit: 'px', scope: 'theme' },
  '--hero-cta-button-border-radius-sm': { category: 'radius', unit: 'px', scope: 'theme' },
  '--hero-cta-button-padding-x-sm': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--hero-cta-button-padding-y-sm': { category: 'spacing', unit: 'px', scope: 'theme' },
  '--hero-cta-button-font-size-sm': { category: 'size', unit: 'px', scope: 'theme' },
  '--hero-cta-button-font-size-md': { category: 'size', unit: 'px', scope: 'theme' },
} as const satisfies Record<`--${string}`, TokenMeta>;

export type TokenKey = keyof typeof TOKEN_REGISTRY;

import type { TokenKey } from './registry';

export const BASE_DEFAULTS: Record<TokenKey, string> = {
  // Colors (RGB triplets — neutral grayscale fallback)
  '--color-bg': '255 255 255',
  '--color-surface': '250 250 250',
  '--color-heading': '17 17 17',
  '--color-text': '51 51 51',
  '--color-muted': '120 120 120',
  '--color-primary': '17 17 17',
  '--color-accent': '17 17 17',
  '--color-accent-fg': '255 255 255',
  '--color-accent-2': '60 60 60',
  '--color-button-bg': '17 17 17',
  '--color-button-text': '255 255 255',
  '--color-button-border': '17 17 17',
  '--color-button-2-bg': '255 255 255',
  '--color-button-2-text': '17 17 17',
  '--color-button-2-border': '200 200 200',
  '--color-border': '230 230 230',
  '--color-link': '17 17 17',
  '--color-input-bg': '255 255 255',
  '--color-input-border': '210 210 210',
  '--color-input-label': '120 120 120',
  '--color-input-placeholder': '160 160 160',
  '--color-error': '220 38 38',

  // Typography
  '--font-heading': 'system-ui, sans-serif',
  '--font-body': 'system-ui, sans-serif',
  '--weight-heading': '600',
  '--weight-body': '400',
  '--size-hero-heading': '48px',
  '--size-nav-link': '16px',
  '--size-checkout-brand': '20px',
  '--size-checkout-brand-image': '32px',
  '--size-h2': '24px',
  '--size-h3': '18px',
  '--size-body': '16px',
  '--size-small': '14px',
  '--size-tiny': '12px',

  // Radii
  '--radius-button': '0px',
  '--radius-input': '0px',
  '--radius-card': '0px',
  '--radius-media': '0px',
  '--radius-field': '0px',

  // Spacing
  '--spacing-section-y': '80px',
  '--spacing-grid-col-gap': '16px',
  '--spacing-grid-row-gap': '40px',

  // Sizes
  '--container-max-width': '1320px',
  '--size-hero-button-h': '48px',
  '--size-newsletter-form-w': '652px',
  '--size-logo-width': '120px',
  '--size-card-border': '0px',

  // Variants
  '--button-style': 'solid',
  '--footer-layout': '2-part',
  '--contact-form-layout': 'wide',
  '--cart-type': 'drawer',
  '--card-style': 'standard',
  '--card-alignment': 'left',
  '--text-transform-heading': 'none',
};

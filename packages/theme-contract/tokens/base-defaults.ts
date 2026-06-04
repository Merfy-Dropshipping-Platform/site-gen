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
  // Pre-existing globals — стандартный hover-контракт: при hover button
  // меняет местами bg ↔ text. Темы могут переопределять per-scheme.
  // RGB-триплеты повторяют значения --color-text / --color-bg.
  '--color-button-bg-hover': '51 51 51',
  '--color-button-text-hover': '255 255 255',
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
  '--font-cart-counter': 'inherit',
  '--font-powered-by': 'inherit',
  // Pre-existing — pagination font в Hero carousel. Default наследует
  // body-шрифт; темы могут переопределить (rose ставит 'Exo 2').
  '--font-pagination': 'system-ui, sans-serif',
  '--weight-heading': '600',
  '--weight-body': '400',
  '--size-hero-heading': '48px',
  // Pre-existing — per-block размер заголовка Hero. Empty default
  // означает «нет override»: Hero.classes.ts падает обратно к
  // --size-hero-heading (по аналогии с --color-header-bg/--size-header-h).
  // При активной Puck-настройке heading.size Hero.astro инжектит
  // расчётное значение inline через `style="--hero-heading-size:..."`.
  '--hero-heading-size': '',
  '--slide-min-height': '60vh',
  '--size-section-heading': '20px',
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
  // 084 Stage 3 catalog — pre-084 defaults match prior hardcoded
  // values in Catalog.astro (gap: 16px, sidebar grid-template-columns:
  // 220px). Sidebar fallback is 220px to preserve exact pre-Stage-3
  // dimension on rose/satin/bloom/flux. Vanilla overrides both to
  // 294px/40px in theme-vanilla/theme.json.
  '--catalog-sidebar-w': '220px',
  '--catalog-grid-row-gap': '16px',

  // Sizes
  '--container-max-width': '1320px',
  '--size-hero-button-h': '48px',
  '--size-newsletter-form-w': '652px',
  // Высота лого (semantically "logo size") — Header.classes.ts использует
  // h-[var(...)] для контроля высоты. Slider в Theme Settings — 0-40 step 4.
  '--size-logo-width': '24px',
  '--size-card-border': '0px',
  '--promo-banner-h-thin': '40px',

  // Theme-scope colors (used by universal blocks)
  '--color-bottom-strip-bg': '0 0 0',
  '--color-bottom-strip-text': '255 255 255',
  // 084 vanilla pilot — Header surface colour. Empty triplet means
  // "no override" — Header.classes.ts falls back to `--color-bg` so
  // pre-084 themes keep their existing behaviour. Vanilla theme.json
  // sets it explicitly to `58 69 48` for the Figma-spec olive band.
  '--color-header-bg': '',
  // 084 vanilla pilot — Header total height (empty = auto). Vanilla
  // theme.json sets it to `80px` per Figma 1:18957.
  '--size-header-h': '',

  // Variants
  '--button-style': 'solid',
  '--footer-layout': '2-part',
  '--contact-form-layout': 'wide',
  '--cart-type': 'drawer',
  '--card-style': 'standard',
  '--card-alignment': 'left',
  '--text-transform-heading': 'none',
  // ── v2 миграция — запасные значения (добавлено скриптом)
  '--header-nav-gap': '32px',
  '--header-nav-gap-lg': '48px',
  '--header-logo-link-font-size': '20px',
  '--header-nav-link-font-size': 'var(--size-nav-link)',
  '--header-nav-link-padding-bottom': '4px',
  '--header-nav-link-font-size-lg': '16px',
  '--header-action-search-opacity-hover': '0.7',
  '--header-cart-badge-min-width': '18px',
  '--header-cart-badge-height': '18px',
  '--header-action-profile-opacity-hover': '0.7',
  '--header-mobile-menu-root-width': 'full',
  '--header-mobile-menu-root-background-color': 'white',
  '--header-mobile-menu-root-padding-x': '16px',
  '--header-mobile-menu-root-padding-top': '16px',
  '--header-mobile-menu-root-padding-bottom': '32px',
  '--header-mobile-menu-root-padding-x-sm': '20px',
  '--header-mobile-menu-root-padding-x-md': '40px',
  // ── v2 миграция — запасные значения (добавлено скриптом)
  '--footer-container-max-width': '1920px',
  '--footer-container-padding-x-sm': '24px',
  '--footer-container-padding-x-md': '32px',
  '--footer-container-padding-x-lg': '48px',
  '--footer-container-padding-x-xl': '64px',
  '--footer-container-width': 'full',
  '--footer-container-padding-bottom': '80px',
  '--footer-container-padding-top': '80px',
  '--footer-container-padding-x-2xl': '280px',
  '--footer-newsletter-wrapper-width': 'full',
  '--footer-newsletter-wrapper-gap': '20px',
  '--footer-newsletter-copy-max-width': '1320px',
  '--footer-newsletter-copy-text-align': 'left',
  '--footer-newsletter-heading-width': 'full',
  '--footer-newsletter-form-max-width': '652px',
  '--footer-newsletter-form-height': '64px',
  '--footer-newsletter-form-border-radius': '8px',
  '--footer-newsletter-form-gap': '8px',
  '--footer-newsletter-form-border-color': '#999999',
  '--footer-newsletter-form-padding-left': '18px',
  '--footer-newsletter-form-padding-right': '16px',
  '--footer-newsletter-form-border-color-focus-within': '#000000',
  '--footer-newsletter-input-font-size': '20px',
  '--footer-newsletter-submit-font-size': '16px',
  '--footer-newsletter-submit-transform-active': 'scale(0.95)',
  '--footer-main-section-width': 'full',
  '--footer-main-section-gap': '40px',
  '--footer-main-grid-gap': '32px',
  '--footer-main-grid-gap-sm': '200px',
  '--footer-column-root-gap': '16px',
  '--footer-email-text-align-lg': 'right',
  '--footer-copyright-bar-height': 'auto',
  '--footer-copyright-bar-padding-x': '16px',
  '--footer-copyright-text-font-size': '20px',
  '--footer-copyright-text-color': 'white',
};

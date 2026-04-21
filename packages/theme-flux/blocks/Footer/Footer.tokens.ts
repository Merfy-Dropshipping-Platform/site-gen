// Flux Footer tokens.
// Inherits --footer-layout: '2-part' + powered-by bar. Dark-friendly orange
// accent (--color-accent / --color-button-bg = #fa5109), 6px button radius.
export const FooterTokens = [
  '--color-bg',
  '--color-heading',
  '--color-text',
  '--color-muted',
  '--color-accent',
  '--color-button-bg',
  '--color-button-text',
  '--font-heading',
  '--font-body',
  '--size-nav-link',
  '--footer-layout',
  '--container-max-width',
  '--spacing-section-y',
  '--radius-input',
  '--radius-button',
] as const satisfies readonly `--${string}`[];

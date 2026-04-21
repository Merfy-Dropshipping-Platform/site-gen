// Rose Footer tokens.
// Inherits --footer-layout: '3-column' from theme.json defaults.
export const FooterTokens = [
  '--color-bg',
  '--color-heading',
  '--color-text',
  '--color-muted',
  '--font-heading',
  '--font-body',
  '--size-nav-link',
  '--footer-layout',
  '--container-max-width',
  '--spacing-section-y',
  '--radius-input',
] as const satisfies readonly `--${string}`[];

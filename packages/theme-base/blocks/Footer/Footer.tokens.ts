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
] as const satisfies readonly `--${string}`[];

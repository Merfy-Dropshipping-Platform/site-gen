// Satin Footer tokens.
// Inherits --footer-layout: '2-part' + powered-by bar. Monochrome palette,
// flat (0px) radii. Uppercase newsletter heading + submit from classes.
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
  '--font-button',
  '--size-nav-link',
  '--footer-layout',
  '--container-max-width',
  '--spacing-section-y',
  '--radius-input',
  '--radius-button',
] as const satisfies readonly `--${string}`[];

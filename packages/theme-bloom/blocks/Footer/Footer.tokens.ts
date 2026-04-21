// Bloom Footer tokens.
// Inherits --footer-layout: '2-part' from theme.json defaults (logo+nav LEFT,
// contact+social RIGHT), plus a powered-by black bar below (shared with
// Vanilla). Pink-palette via --color-* + pill submit via --radius-button.
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

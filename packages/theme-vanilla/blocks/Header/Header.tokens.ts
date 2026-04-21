// Vanilla Header tokens — declared for validator whitelist compliance.
// All visual styling flows through these CSS vars so merchant schemes work.
export const HeaderTokens = [
  '--color-bg',
  '--color-heading',
  '--color-text',
  '--color-muted',
  '--color-primary',
  '--color-accent',
  '--color-button-text',
  '--font-heading',
  '--font-body',
  '--size-nav-link',
  '--size-logo-width',
  '--container-max-width',
] as const satisfies readonly `--${string}`[];

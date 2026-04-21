// Flux Header tokens — declared for validator whitelist compliance.
// Tech/electronics aesthetic: orange accent + 6px button radius.
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
  '--radius-button',
] as const satisfies readonly `--${string}`[];

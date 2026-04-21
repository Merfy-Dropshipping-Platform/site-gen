export const HeaderTokens = [
  '--color-bg',
  '--color-heading',
  '--color-text',
  '--color-primary',
  '--font-heading',
  '--font-body',
  '--size-nav-link',
  '--size-logo-width',
  '--container-max-width',
] as const satisfies readonly `--${string}`[];

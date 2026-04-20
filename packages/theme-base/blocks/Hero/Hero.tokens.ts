export const HeroTokens = [
  '--color-bg',
  '--color-heading',
  '--color-text',
  '--color-button-bg',
  '--color-button-text',
  '--color-button-border',
  '--radius-button',
  '--font-heading',
  '--font-body',
  '--size-hero-heading',
  '--size-hero-button-h',
  '--container-max-width',
] as const satisfies readonly `--${string}`[];

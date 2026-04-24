export const MainTextTokens = [
  '--color-bg',
  '--color-heading',
  '--color-text',
  '--color-button-bg',
  '--color-button-text',
  '--color-button-border',
  '--font-heading',
  '--font-body',
  '--size-hero-heading',
  '--spacing-section-y',
  '--container-max-width',
  '--radius-button',
] as const satisfies readonly `--${string}`[];

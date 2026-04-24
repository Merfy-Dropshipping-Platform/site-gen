export const ImageWithTextTokens = [
  '--color-bg',
  '--color-surface',
  '--color-heading',
  '--color-text',
  '--color-button-bg',
  '--color-button-text',
  '--color-button-border',
  '--font-heading',
  '--font-body',
  '--container-max-width',
] as const satisfies readonly `--${string}`[];

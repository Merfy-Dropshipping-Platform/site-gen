export const MultiColumnsTokens = [
  '--color-bg',
  '--color-surface',
  '--color-heading',
  '--color-text',
  '--font-heading',
  '--font-body',
  '--container-max-width',
] as const satisfies readonly `--${string}`[];

export const CartSummaryTokens = [
  '--color-bg',
  '--color-text',
  '--color-muted',
  '--color-button-bg',
  '--color-button-text',
  '--font-body',
  '--container-max-width',
] as const satisfies readonly `--${string}`[];

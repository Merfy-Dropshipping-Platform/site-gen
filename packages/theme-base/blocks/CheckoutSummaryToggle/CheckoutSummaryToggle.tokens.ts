export const CheckoutSummaryToggleTokens = [
  '--color-bg',
  '--color-text',
  '--color-border',
  '--font-body',
  '--size-body',
  '--container-max-width',
] as const satisfies readonly `--${string}`[];

export const CheckoutHeaderTokens = [
  '--color-bg',
  '--color-heading',
  '--color-border',
  '--font-heading',
  '--size-checkout-brand',
  '--container-max-width',
] as const satisfies readonly `--${string}`[];

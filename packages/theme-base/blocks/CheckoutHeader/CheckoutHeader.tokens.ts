export const CheckoutHeaderTokens = [
  '--color-bg',
  '--color-heading',
  '--color-border',
  '--font-heading',
  '--size-checkout-brand',
  '--size-checkout-brand-image',
  '--container-max-width',
] as const satisfies readonly `--${string}`[];

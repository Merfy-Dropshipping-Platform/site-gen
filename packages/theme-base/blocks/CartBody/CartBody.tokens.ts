export const CartBodyTokens = [
  '--color-bg',
  '--color-text',
  '--color-muted',
  '--font-heading',
  '--container-max-width',
] as const satisfies readonly `--${string}`[];

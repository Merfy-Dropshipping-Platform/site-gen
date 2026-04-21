export const MainTextTokens = [
  '--color-bg',
  '--color-heading',
  '--color-text',
  '--font-heading',
  '--font-body',
  '--size-hero-heading',
  '--spacing-section-y',
  '--container-max-width',
] as const satisfies readonly `--${string}`[];

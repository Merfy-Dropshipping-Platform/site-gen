export const CollectionsTokens = [
  '--color-bg',
  '--color-surface',
  '--color-heading',
  '--color-text',
  '--font-heading',
  '--font-body',
  '--container-max-width',
  '--radius-media',
] as const satisfies readonly `--${string}`[];

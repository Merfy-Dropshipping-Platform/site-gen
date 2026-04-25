export const CatalogTokens = [
  '--color-bg',
  '--color-surface',
  '--color-heading',
  '--color-text',
  '--color-muted',
  '--font-heading',
  '--font-body',
  '--container-max-width',
  '--spacing-section-y',
  '--radius-card',
  '--radius-media',
] as const satisfies readonly `--${string}`[];

export const BlogSectionTokens = [
  '--color-bg',
  '--color-surface',
  '--color-heading',
  '--color-text',
  '--color-muted',
  '--font-heading',
  '--font-body',
  '--radius-media',
  '--spacing-section-y',
  '--spacing-grid-col-gap',
  '--spacing-grid-row-gap',
  '--container-max-width',
] as const satisfies readonly `--${string}`[];

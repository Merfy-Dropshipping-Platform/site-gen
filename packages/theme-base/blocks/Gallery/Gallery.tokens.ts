export const GalleryTokens = [
  '--color-bg',
  '--color-heading',
  '--color-text',
  '--font-heading',
  '--font-body',
  '--size-hero-heading',
  '--radius-media',
  '--radius-card',
  '--spacing-section-y',
  '--spacing-grid-col-gap',
  '--spacing-grid-row-gap',
  '--container-max-width',
] as const satisfies readonly `--${string}`[];

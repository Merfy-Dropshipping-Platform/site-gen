export const BlogPostSectionTokens = [
  '--color-bg',
  '--color-surface',
  '--color-heading',
  '--color-text',
  '--color-muted',
  '--color-accent',
  '--font-heading',
  '--font-body',
  '--size-body',
  '--radius-media',
  '--spacing-section-y',
  '--container-max-width',
] as const satisfies readonly `--${string}`[];

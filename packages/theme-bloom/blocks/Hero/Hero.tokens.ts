// Bloom Hero tokens — whitelist for validator compliance.
// Uses --color-accent for the pink kicker-style heading (Bloom signature).
export const HeroTokens = [
  '--color-bg',
  '--color-surface',
  '--color-heading',
  '--color-text',
  '--color-muted',
  '--color-accent',
  '--color-button-bg',
  '--color-button-text',
  '--color-button-border',
  '--font-heading',
  '--font-body',
  '--size-hero-heading',
  '--size-hero-button-h',
  '--radius-button',
] as const satisfies readonly `--${string}`[];

// Satin Hero tokens — declared for validator whitelist compliance.
// Edge-to-edge split layout uses base tokens only (no new tokens added).
export const HeroTokens = [
  '--color-bg',
  '--color-surface',
  '--color-heading',
  '--color-text',
  '--color-muted',
  '--color-button-bg',
  '--color-button-text',
  '--color-button-border',
  '--font-heading',
  '--font-body',
  '--size-hero-heading',
  '--size-hero-button-h',
  '--radius-button',
] as const satisfies readonly `--${string}`[];

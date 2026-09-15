export const LoginSectionTokens = [
  '--color-bg',
  '--color-heading',
  '--color-text',
  '--font-heading',
  '--font-body',
  '--size-hero-heading',
  '--spacing-section-y',
  '--container-max-width',
  // Пятый параметр «Кнопка» (репорт тестера 15.09 [5]) — те же токены, что у
  // ImageWithText.tokens.ts.
  '--color-button-bg',
  '--color-button-bg-hover',
  '--color-button-text',
  '--color-button-text-hover',
  '--color-button-border',
  '--radius-button',
] as const satisfies readonly `--${string}`[];

// CSS-var whitelist for the Page block. All vars read through the theme cascade.
export const PageTokens = [
  '--color-bg',
  '--color-text',
  '--color-heading',
  '--color-muted',
  '--color-accent',
  '--container-max-width',
  // Вертикальный ритм секции: значение темы (`--spacing-section-y`) эмиттер
  // отдаёт под обоими именами, разметка читает `--section-padding`.
  '--section-padding',
  '--size-body',
  '--font-body',
  '--font-heading',
] as const;

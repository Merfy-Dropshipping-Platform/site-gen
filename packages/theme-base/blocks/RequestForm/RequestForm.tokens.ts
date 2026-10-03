// RequestForm — CSS var whitelist. Секция «Форма заявки» (спека 118, T013a):
// каркас, встраиваемый в карточку товара; своей палитры не вводит — обёртка
// живёт на теме. Стили sf-* мокапа (в .rq-sf) несут собственные переменные
// --st-* (см. RequestForm.sf-styles.ts) и в этом списке не нуждаются.
export const RequestFormTokens = [
  '--color-bg',
  '--color-heading',
  '--color-text',
  '--color-muted',
  '--font-heading',
  '--font-body',
  '--container-max-width',
] as const satisfies readonly `--${string}`[];

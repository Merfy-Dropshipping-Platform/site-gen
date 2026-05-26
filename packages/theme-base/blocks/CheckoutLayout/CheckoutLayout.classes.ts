export const CheckoutLayoutClasses = {
  // 2-col grid form|gap|summary только на lg+ (≥1024px). Ниже — стек 1 колонка,
  // summary под формой. На <md мобильный toggle (CheckoutSummaryToggle) сворачивает
  // summary в подсказку сверху. Form-min уменьшен с 420 до 360, summary с 360 до 320
  // — чтобы вписаться в 1024px viewport (360+40+320=720 + 64 padding).
  root: 'relative w-full bg-[rgb(var(--color-bg))]',
  grid:
    'grid grid-cols-1 px-4 mx-auto max-w-[var(--container-max-width)] lg:grid-cols-[minmax(360px,var(--checkout-form-col-w))_minmax(40px,var(--checkout-gap))_minmax(320px,var(--checkout-summary-col-w))] lg:gap-0 lg:px-8',
  gridSummaryBottom:
    'grid grid-cols-1 px-4 mx-auto max-w-[var(--container-max-width)] lg:px-8',
  // Form column = grid col 1. Top-pad 64px на десктопе, 40px на узких.
  formColumn:
    'flex flex-col gap-10 min-w-0 pt-10 lg:col-start-1 lg:col-end-2 lg:pt-16',
  // Summary column = grid col 3 на десктопе, стек снизу на <lg. На широких
  // экранах внутренний контент ограничен 520px + 64px inset; на узких
  // — full-width в потоке.
  summaryColumn:
    'flex flex-col gap-[50px] min-w-0 bg-[rgb(var(--color-surface))] mt-6 lg:mt-0 lg:col-start-3 lg:col-end-4 lg:py-16 [&>*]:px-4 lg:[&>*]:max-w-[520px] lg:[&>*]:px-16',
} as const;

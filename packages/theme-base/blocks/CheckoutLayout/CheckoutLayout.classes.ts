export const CheckoutLayoutClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))]',
  gridContainer:
    'mx-auto max-w-[calc(var(--checkout-form-col-w)+var(--checkout-summary-col-w)+var(--checkout-gap))] px-4',
  grid:
    'grid gap-[var(--checkout-gap)] grid-cols-1 md:grid-cols-[var(--checkout-form-col-w)_var(--checkout-summary-col-w)]',
  gridSummaryBottom: 'grid gap-[var(--checkout-gap)] grid-cols-1',
  formColumn: 'flex flex-col gap-10 min-w-0',
  summaryColumn: 'flex flex-col gap-6 min-w-0 bg-[rgb(var(--color-surface))] p-16 self-start rounded-[var(--radius-card)]',
} as const;

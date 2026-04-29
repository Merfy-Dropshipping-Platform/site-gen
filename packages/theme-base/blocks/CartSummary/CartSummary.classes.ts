// CartSummary — wrapper chrome для disclaimer + total + checkout button.
// Содержимое рендерится CartSummaryIsland (на live) или inline JS (в preview).
export const CartSummaryClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container: 'w-full max-w-[var(--container-max-width)] mx-auto px-[24px] sm:px-[40px]',
  inner: 'flex flex-col items-end gap-[25px]',
  disclaimer: 'font-[var(--font-body)] text-[16px] leading-[22px] text-[rgb(var(--color-muted))] text-right max-w-[318px] m-0',
  totalRow: 'flex items-center gap-[15px]',
  totalLabel: 'font-[var(--font-body)] text-[20px] leading-[27px] text-[rgb(var(--color-text))]',
  totalValue: 'font-[var(--font-body)] text-[20px] leading-[27px] text-[rgb(var(--color-text))]',
  checkoutBtn:
    'flex items-center justify-center font-[var(--font-body)] cursor-pointer transition-colors border-0 no-underline ' +
    'bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))]',
} as const;

// CartSummary — disclaimer + total + checkout button. Same UI as rose live
// cart.astro so constructor preview matches live storefront.
export const CartSummaryClasses = {
  root: 'relative w-full',
  container: 'max-w-[768px] mx-auto px-4 sm:px-6',
  inner: 'cart-summary flex flex-col items-end gap-[25px]',
  disclaimer:
    'cart-summary-disclaimer font-body text-[16px] leading-[22px] ' +
    'text-[rgb(var(--color-muted))] text-right m-0 max-w-[318px]',
  totalRow: 'flex items-center gap-[15px]',
  totalLabel: 'font-body text-[20px] leading-[27px] text-[rgb(var(--color-foreground))]',
  totalValue: 'font-body text-[20px] leading-[27px] text-[rgb(var(--color-foreground))]',
  checkoutBtn:
    'cart-checkout-btn flex items-center justify-center font-body cursor-pointer ' +
    'transition-colors border-0 no-underline ' +
    'bg-[rgb(var(--color-foreground))] text-[rgb(var(--color-background))]',
} as const;

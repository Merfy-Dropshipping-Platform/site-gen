export const CheckoutTotalsClasses = {
  root: 'w-full flex flex-col gap-2',
  row: 'flex items-center justify-between text-[length:var(--size-body)] text-[rgb(var(--color-text))] [font-family:var(--font-body)]',
  totalRow: 'flex items-center justify-between text-[length:var(--size-h2)] text-[rgb(var(--color-text))] font-semibold pt-2 border-t border-[rgb(var(--color-border)/.5)]',
  discount: 'flex items-center justify-between text-[length:var(--size-body)] text-[rgb(var(--color-accent))]',
} as const;

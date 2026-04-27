export const CheckoutOrderSummaryClasses = {
  root: 'w-full',
  heading: 'mb-4 [font-family:var(--font-heading)] text-[length:var(--size-h3)] text-[rgb(var(--color-heading))]',
  items: 'flex flex-col gap-3',
  promo: 'mt-4 flex items-center gap-2 px-3 py-2 border border-dashed border-[rgb(var(--color-input-border))] rounded-[var(--radius-input)]',
  promoLabel: 'flex-1 text-[length:var(--size-body)] text-[rgb(var(--color-text))] cursor-pointer',
  promoApply: 'px-3 py-1.5 bg-[rgb(var(--color-accent))] text-[rgb(var(--color-accent-fg))] rounded-[var(--radius-button)] text-[length:var(--size-small)]',
} as const;

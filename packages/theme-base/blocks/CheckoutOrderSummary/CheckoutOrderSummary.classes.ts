export const CheckoutOrderSummaryClasses = {
  root: 'w-full',
  heading: 'mb-4 [font-family:var(--font-heading)] text-[length:var(--size-h3)] text-[rgb(var(--color-heading))]',
  items: 'flex flex-col gap-3',
  promo: 'mt-4 flex items-stretch h-14 border border-[rgb(var(--color-input-border))] rounded-[var(--radius-input)] overflow-hidden bg-[rgb(var(--color-input-bg))]',
  promoLabel: 'flex-1 px-4 flex items-center text-[length:var(--size-body)] text-[rgb(var(--color-input-placeholder))]',
  promoApply: 'px-6 bg-[rgb(var(--color-accent))] text-[rgb(var(--color-accent-fg))] text-[length:var(--size-body)]',
} as const;

// Per Figma 1:13451 — gap 12, no border between rows, total row Manrope 20/400 (no font-semibold), label/value both #000000.
export const CheckoutTotalsClasses = {
  root: 'w-full flex flex-col gap-3',
  row: 'flex items-center justify-between text-[length:var(--size-body)] text-[rgb(var(--color-text))] [font-family:var(--font-body)]',
  totalRow: 'flex items-center justify-between text-[length:var(--size-h2)] text-[rgb(var(--color-text))] [font-family:var(--font-body)]',
  discount: 'flex items-center justify-between text-[length:var(--size-body)] text-[rgb(var(--color-accent))]',
} as const;

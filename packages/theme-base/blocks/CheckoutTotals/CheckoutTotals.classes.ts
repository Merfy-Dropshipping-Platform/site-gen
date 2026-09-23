// Per Figma 1:13451 — gap 12, no border between rows, total row Manrope 20/400 (no font-semibold), label/value both #000000.
export const CheckoutTotalsClasses = {
  root: 'w-full flex flex-col gap-3',
  row: 'flex items-center justify-between text-[length:var(--size-body)] text-[rgb(var(--color-text))] [font-family:var(--font-body)]',
  totalRow: 'flex items-center justify-between text-[length:var(--size-h2)] text-[rgb(var(--color-text))] [font-family:var(--font-body)]',
  discount: 'flex items-center justify-between text-[length:var(--size-body)] text-[rgb(var(--color-text))]',
  // PR-19 — точка расширений «Оформление заказа» (перед строкой итога).
  // `empty:hidden` — без включённых расширений строка не съедает `gap-3` родителя.
  extPoint: 'empty:hidden flex flex-col gap-2',
} as const;

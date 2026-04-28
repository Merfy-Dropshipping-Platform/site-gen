// Per Figma 1:13403 — heading Manrope 16/400, items gap 24, promo wrapper 56h with inner button (44h, 12px pad), 24px gap before promo.
export const CheckoutOrderSummaryClasses = {
  root: 'w-full',
  heading: 'mb-4 [font-family:var(--font-body)] text-[length:var(--size-h3)] text-[rgb(var(--color-heading))]',
  items: 'flex flex-col gap-6',
  promo: 'mt-6 flex items-stretch h-14 border border-[rgb(var(--color-input-border))] rounded-[var(--radius-input)] overflow-hidden bg-[rgb(var(--color-input-bg))] p-1.5 pl-3',
  promoLabel: 'flex-1 flex items-center text-[length:var(--size-body)] text-[rgb(var(--color-input-placeholder))]',
  // Use button-bg/button-text (always emitted by theme generator) — accent vars are missing from current scheme CSS.
  // Trailing `!` forces important to beat Tailwind preflight `button,[type=submit]{background-color:#0000}`.
  promoApply: 'px-3 bg-[rgb(var(--color-button-bg))]! text-[rgb(var(--color-button-text))]! text-[length:var(--size-small)] rounded-[var(--radius-button)]',
} as const;

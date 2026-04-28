export const CheckoutDeliveryMethodClasses = {
  root: 'w-full',
  // Per Figma 1:13501 — heading Manrope 16/400 mb-4; options 60h padding 12, title 14, price 12, subtitle 12 muted; gap 16 between cards.
  heading: 'mb-4 [font-family:var(--font-body)] text-[length:var(--size-h3)] text-[rgb(var(--color-heading))]',
  list: 'flex flex-col gap-4',
  option: 'flex flex-col justify-center h-[60px] px-3 border border-[rgb(var(--color-input-border))] rounded-[var(--radius-input)] cursor-pointer transition-colors hover:border-[rgb(var(--color-text)/.4)]',
  // Selected state — use --color-text (theme always defines it); accent vars missing from generator CSS.
  optionSelected: 'border-[rgb(var(--color-text))]',
  radio: 'sr-only',
  body: 'flex-1 flex flex-col',
  label: '[font-family:var(--font-body)] text-[length:var(--size-small)] text-[rgb(var(--color-text))]',
  meta: 'mt-0.5 text-[length:var(--size-tiny)] text-[rgb(var(--color-muted))]',
  price: '[font-family:var(--font-body)] text-[length:var(--size-tiny)] text-[rgb(var(--color-text))]',
} as const;

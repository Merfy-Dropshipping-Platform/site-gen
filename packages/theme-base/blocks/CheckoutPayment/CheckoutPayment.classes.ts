export const CheckoutPaymentClasses = {
  // Per Figma 1:13517 — heading Manrope 16/400, 2px gap to subtitle, 32px before list; gap 16 between methods; option label 16/400 black; radio 20×20.
  root: 'w-full',
  heading: '[font-family:var(--font-body)] text-[length:var(--size-h3)] text-[rgb(var(--color-heading))]',
  subheading: 'mt-0.5 mb-8 text-[length:var(--size-small)] text-[rgb(var(--color-muted))]',
  list: 'flex flex-col gap-4',
  option: 'flex items-center gap-2 px-3 py-5 border border-[rgb(var(--color-input-border))] rounded-[var(--radius-input)] cursor-pointer transition-colors hover:border-[rgb(var(--color-text)/.4)]',
  // Selected state — use --color-text (theme always defines it); accent vars missing from generator CSS.
  optionSelected: 'border-[rgb(var(--color-text))]',
  radio: 'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-[rgb(var(--color-input-border))]',
  label: 'flex-1 [font-family:var(--font-body)] text-[length:var(--size-body)] text-[rgb(var(--color-text))]',
  brand: 'h-4 w-auto',
} as const;

export const CheckoutPaymentClasses = {
  root: 'w-full',
  heading: '[font-family:var(--font-heading)] text-[length:var(--size-h3)] text-[rgb(var(--color-heading))]',
  subheading: 'mb-4 text-[length:var(--size-small)] text-[rgb(var(--color-muted))]',
  list: 'flex flex-col gap-2',
  option: 'flex items-center gap-3 px-4 py-4 border border-[rgb(var(--color-input-border))] rounded-[var(--radius-input)] cursor-pointer transition-colors hover:border-[rgb(var(--color-text)/.4)]',
  optionSelected: 'border-[rgb(var(--color-accent))]',
  radio: 'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-[rgb(var(--color-input-border))]',
  label: 'flex-1 [font-family:var(--font-body)] text-[length:var(--size-body)] text-[rgb(var(--color-text))]',
  brand: 'h-4 w-auto',
} as const;

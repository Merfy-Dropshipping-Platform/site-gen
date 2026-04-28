export const CheckoutDeliveryMethodClasses = {
  root: 'w-full',
  heading: 'mb-4 [font-family:var(--font-heading)] text-[length:var(--size-h3)] text-[rgb(var(--color-heading))]',
  list: 'flex flex-col gap-2',
  option: 'block px-4 py-4 border border-[rgb(var(--color-input-border))] rounded-[var(--radius-input)] cursor-pointer transition-colors hover:border-[rgb(var(--color-text)/.4)]',
  optionSelected: 'border-[rgb(var(--color-accent))]',
  radio: 'sr-only',
  body: 'flex-1 flex flex-col',
  label: '[font-family:var(--font-body)] text-[length:var(--size-body)] text-[rgb(var(--color-text))]',
  meta: 'text-[length:var(--size-small)] text-[rgb(var(--color-muted))]',
  price: '[font-family:var(--font-body)] text-[length:var(--size-body)] text-[rgb(var(--color-text))]',
} as const;

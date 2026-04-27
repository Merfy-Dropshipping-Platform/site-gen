export const CheckoutDeliveryMethodClasses = {
  root: 'w-full',
  heading: 'mb-4 [font-family:var(--font-heading)] text-[length:var(--size-h3)] text-[rgb(var(--color-heading))]',
  list: 'flex flex-col gap-2',
  option: 'flex items-start gap-3 px-3 py-3 border border-[rgb(var(--color-input-border))] rounded-[var(--radius-input)] cursor-pointer hover:bg-[rgb(var(--color-input-bg))]',
  optionSelected: 'border-[rgb(var(--color-accent))] bg-[rgb(var(--color-accent)/.04)]',
  radio: 'mt-1 w-5 h-5 rounded-full border border-[rgb(var(--color-input-border))]',
  body: 'flex-1 flex flex-col',
  label: '[font-family:var(--font-body)] text-[length:var(--size-body)] text-[rgb(var(--color-text))]',
  meta: 'text-[length:var(--size-small)] text-[rgb(var(--color-muted))]',
  price: '[font-family:var(--font-body)] text-[length:var(--size-body)] text-[rgb(var(--color-text))]',
} as const;

export const CheckoutPaymentClasses = {
  root: 'w-full',
  heading: '[font-family:var(--font-heading)] text-[length:var(--size-h3)] text-[rgb(var(--color-heading))]',
  subheading: 'mb-4 text-[length:var(--size-small)] text-[rgb(var(--color-muted))]',
  list: 'flex flex-col gap-2',
  option: 'flex items-center gap-3 px-3 py-3 border border-[rgb(var(--color-input-border))] rounded-[var(--radius-input)] cursor-pointer',
  optionSelected: 'border-[rgb(var(--color-accent))] bg-[rgb(var(--color-accent)/.04)]',
  radio: 'w-5 h-5 rounded-full border border-[rgb(var(--color-input-border))]',
  label: 'flex-1 [font-family:var(--font-body)] text-[length:var(--size-body)] text-[rgb(var(--color-text))]',
  brand: 'h-4 w-auto',
} as const;

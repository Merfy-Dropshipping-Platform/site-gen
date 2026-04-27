export const CheckoutDeliveryFormClasses = {
  root: 'w-full',
  heading: 'mb-4 [font-family:var(--font-heading)] text-[length:var(--size-h3)] text-[rgb(var(--color-heading))]',
  fields: 'flex flex-col gap-3',
  fieldRow2: 'grid grid-cols-2 gap-3',
  field: 'relative flex flex-col justify-center bg-[rgb(var(--color-input-bg))] border border-[rgb(var(--color-input-border))] rounded-[var(--radius-input)] px-3 h-14',
  label: 'text-[length:var(--size-tiny)] text-[rgb(var(--color-input-label))]',
  input: 'bg-transparent outline-none text-[length:var(--size-body)] text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-input-placeholder))]',
  searchIcon: 'absolute right-3 top-1/2 -translate-y-1/2 text-[rgb(var(--color-input-placeholder))]',
} as const;

export const CheckoutContactFormClasses = {
  root: 'w-full',
  heading: 'flex items-center justify-between mb-4 [font-family:var(--font-heading)] text-[length:var(--size-h3)] text-[rgb(var(--color-heading))]',
  authLink: 'text-[length:var(--size-small)] text-[rgb(var(--color-link))] hover:underline',
  fields: 'flex flex-col gap-3',
  field: 'relative flex flex-col justify-center bg-[rgb(var(--color-input-bg))] border border-[rgb(var(--color-input-border))] rounded-[var(--radius-input)] px-3 h-14',
  label: 'text-[length:var(--size-tiny)] text-[rgb(var(--color-input-label))]',
  input: 'bg-transparent outline-none text-[length:var(--size-body)] text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-input-placeholder))]',
} as const;

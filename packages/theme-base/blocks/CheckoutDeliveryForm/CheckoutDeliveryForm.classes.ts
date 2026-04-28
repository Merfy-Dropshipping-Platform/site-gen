export const CheckoutDeliveryFormClasses = {
  // Per Figma 1:13474 — heading Manrope; fields gap 16; padding 12px; search icon right-3.
  root: 'w-full',
  heading: 'mb-4 [font-family:var(--font-body)] text-[length:var(--size-h3)] text-[rgb(var(--color-heading))]',
  fields: 'flex flex-col gap-4',
  fieldRow2: 'grid grid-cols-1 md:grid-cols-2 gap-4',
  field: 'relative flex flex-col justify-center bg-[rgb(var(--color-input-bg))] border border-[rgb(var(--color-input-border))] rounded-[var(--radius-input)] px-3 h-14',
  label: 'text-[length:var(--size-tiny)] text-[rgb(var(--color-input-label))]',
  input: 'bg-transparent outline-none text-[length:var(--size-body)] text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-input-placeholder))]',
  searchIcon: 'absolute right-3 top-1/2 -translate-y-1/2 text-[rgb(var(--color-input-placeholder))]',
} as const;

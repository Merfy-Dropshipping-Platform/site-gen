export const CheckoutContactFormClasses = {
  // Per Figma 1:13461 — heading Manrope (body font, not Comfortaa heading); authLink muted underlined; fields gap 16; padding 12px.
  root: 'w-full',
  heading: 'flex items-center justify-between mb-4 [font-family:var(--font-body)] text-[length:var(--size-h3)] text-[rgb(var(--color-heading))]',
  authLink: 'text-[length:var(--size-small)] text-[rgb(var(--color-muted))] underline underline-offset-2 hover:no-underline',
  fields: 'grid grid-cols-1 md:grid-cols-2 gap-4',
  field: 'relative flex flex-col justify-center bg-[rgb(var(--color-input-bg))] border border-[rgb(var(--color-input-border))] rounded-[var(--radius-input)] px-3 h-14',
  label: 'text-[length:var(--size-tiny)] text-[rgb(var(--color-input-label))]',
  input: 'bg-transparent outline-none text-[length:var(--size-body)] text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-input-placeholder))]',
} as const;

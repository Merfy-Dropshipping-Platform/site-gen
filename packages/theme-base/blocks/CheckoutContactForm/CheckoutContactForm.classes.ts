// Per Figma 1:13461 — heading Manrope (body font, not Comfortaa heading);
// authLink muted underlined; fields gap 16; padding 12px.
// Floating-label pattern: label по центру когда :placeholder-shown и !:focus,
// уезжает наверх (top:8px, tiny size) при focus / when input has value.
export const CheckoutContactFormClasses = {
  root: 'w-full',
  heading:
    'flex items-center justify-between mb-4 [font-family:var(--font-body)] text-[length:var(--size-h3)] text-[rgb(var(--color-heading))]',
  authLink:
    'text-[length:var(--size-small)] text-[rgb(var(--color-muted))] underline underline-offset-2 hover:no-underline',
  fields: 'grid grid-cols-1 md:grid-cols-2 gap-4',
  field:
    'relative bg-[rgb(var(--color-input-bg))] border border-[rgb(var(--color-input-border))] rounded-[var(--radius-input)] h-14 transition-colors focus-within:border-[rgb(var(--color-text)/.5)]',
  input:
    'peer block w-full h-full px-3 pt-5 pb-1 bg-transparent outline-none [font-family:var(--font-body)] text-[length:var(--size-body)] text-[rgb(var(--color-text))] placeholder-transparent rounded-[var(--radius-input)]',
  label:
    'absolute left-3 top-1.5 [font-family:var(--font-body)] text-[10px] leading-none text-[rgb(var(--color-input-label))] pointer-events-none transition-all duration-150 ease-out peer-[:placeholder-shown:not(:focus)]:top-1/2 peer-[:placeholder-shown:not(:focus)]:-translate-y-1/2 peer-[:placeholder-shown:not(:focus)]:text-[length:var(--size-body)] peer-[:placeholder-shown:not(:focus)]:text-[rgb(var(--color-input-placeholder))]',
} as const;

// Per Figma 1:13474 — heading Manrope; fields gap 16; padding 12px; search icon right-3.
// Floating-label pattern: label по центру в empty+blur, уезжает наверх при focus / has-value.
// dropdown — для country selector и DaData suggestions.
export const CheckoutDeliveryFormClasses = {
  root: 'w-full',
  heading:
    'mb-4 [font-family:var(--font-body)] text-[length:var(--size-h3)] text-[rgb(var(--color-heading))]',
  fields: 'flex flex-col gap-4',
  fieldRow2: 'grid grid-cols-1 md:grid-cols-2 gap-4',
  field:
    'relative bg-[rgb(var(--color-input-bg))] border border-[rgb(var(--color-input-border))] rounded-[var(--radius-input)] h-14 transition-colors focus-within:border-[rgb(var(--color-text)/.5)]',
  input:
    'peer block w-full h-full px-3 pt-5 pb-1 bg-transparent outline-none [font-family:var(--font-body)] text-[length:var(--size-body)] text-[rgb(var(--color-text))] placeholder-transparent rounded-[var(--radius-input)]',
  inputWithIcon:
    'peer block w-full h-full pl-3 pr-10 pt-5 pb-1 bg-transparent outline-none [font-family:var(--font-body)] text-[length:var(--size-body)] text-[rgb(var(--color-text))] placeholder-transparent rounded-[var(--radius-input)]',
  label:
    'absolute left-3 top-2 [font-family:var(--font-body)] text-[length:var(--size-tiny)] text-[rgb(var(--color-input-label))] pointer-events-none transition-all duration-150 ease-out peer-[:placeholder-shown:not(:focus)]:top-1/2 peer-[:placeholder-shown:not(:focus)]:-translate-y-1/2 peer-[:placeholder-shown:not(:focus)]:text-[length:var(--size-body)] peer-[:placeholder-shown:not(:focus)]:text-[rgb(var(--color-input-placeholder))]',
  searchIcon:
    'absolute right-3 top-1/2 -translate-y-1/2 text-[rgb(var(--color-input-placeholder))] pointer-events-none',
  chevron:
    'absolute right-3 top-1/2 -translate-y-1/2 text-[rgb(var(--color-input-placeholder))] pointer-events-none transition-transform',
  dropdown:
    'absolute top-full left-0 right-0 mt-1 max-h-72 overflow-y-auto bg-[rgb(var(--color-bg))] border border-[rgb(var(--color-input-border))] rounded-[var(--radius-input)] shadow-lg z-50 list-none p-0 m-0',
  dropdownItem:
    'block w-full text-left px-3 py-2 cursor-pointer hover:bg-[rgb(var(--color-input-bg))] [font-family:var(--font-body)] text-[length:var(--size-body)] text-[rgb(var(--color-text))]',
} as const;

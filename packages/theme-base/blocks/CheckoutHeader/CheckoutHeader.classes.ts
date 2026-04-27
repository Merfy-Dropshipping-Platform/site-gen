export const CheckoutHeaderClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))] border-b border-[rgb(var(--color-border)/.5)]',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4 py-4 flex items-center justify-between',
  brand: '[font-family:var(--font-heading)] text-[length:var(--size-checkout-brand)] text-[rgb(var(--color-heading))] no-underline tracking-wide',
  brandImage: 'h-[var(--size-checkout-brand-image)] w-auto object-contain',
  iconRight: 'flex items-center justify-center w-8 h-8 text-[rgb(var(--color-heading))] hover:opacity-80',
} as const;

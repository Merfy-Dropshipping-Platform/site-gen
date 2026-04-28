export const CheckoutHeaderClasses = {
  // Per Figma 1:13563 — full-width, 80px tall, side-pad 300px (matches checkout-side-pad), no bottom border.
  root: 'relative w-full bg-[rgb(var(--color-bg))]',
  container: 'w-full px-4 md:px-[var(--checkout-side-pad,300px)] py-6 flex items-center justify-between',
  // Logo per Figma — Comfortaa display font; theme `--font-heading` остаётся fallback.
  brand: "[font-family:'Comfortaa',var(--font-heading)] text-[length:var(--size-checkout-brand)] text-[rgb(var(--color-heading))] no-underline tracking-wide",
  brandImage: 'h-[var(--size-checkout-brand-image)] w-auto object-contain',
  iconRight: 'flex items-center justify-center w-8 h-8 text-[rgb(var(--color-heading))] hover:opacity-80',
} as const;

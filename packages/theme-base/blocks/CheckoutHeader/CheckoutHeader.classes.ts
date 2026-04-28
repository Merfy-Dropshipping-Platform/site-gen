export const CheckoutHeaderClasses = {
  // Per Figma 1:13563 — full-width bar, content centered in standard theme container.
  // Figma spec: 1920 viewport, padding 300/300 → content 1320. Rose container is 1280
  // (~40px diff, не визуально). Layout's summary bg extends past header right edge
  // (full-bleed) — это by design Figma 1:13398.
  root: 'relative w-full bg-[rgb(var(--color-bg))]',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4 md:px-8 py-6 flex items-center justify-between',
  // Logo per Figma — Comfortaa display font; theme `--font-heading` остаётся fallback.
  brand: "[font-family:'Comfortaa',var(--font-heading)] text-[length:var(--size-checkout-brand)] text-[rgb(var(--color-heading))] no-underline tracking-wide",
  brandImage: 'h-[var(--size-checkout-brand-image)] w-auto object-contain',
  iconRight: 'flex items-center justify-center w-8 h-8 text-[rgb(var(--color-heading))] hover:opacity-80',
} as const;

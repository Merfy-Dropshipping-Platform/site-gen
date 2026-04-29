// CartBody — wrapper-only classes. Item rows + empty state rendered inside
// React island (CartBodyIsland) bound to CSS vars. Astro placeholder uses
// section chrome only.
export const CartBodyClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container: 'w-full max-w-[var(--container-max-width)] mx-auto px-[24px] sm:px-[40px]',
  heading: 'font-[var(--font-heading)] uppercase text-[24px] leading-[27px] mb-[25px]',
  body: 'flex flex-col gap-[50px]',
  loadingEmpty: 'flex flex-col items-center py-[64px] gap-[16px]',
  loadingMuted: 'text-[rgb(var(--color-muted))]',
} as const;

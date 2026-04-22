export const HeroClasses = {
  root: 'relative w-full overflow-hidden',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4',
  inner: {
    centered: 'flex flex-col items-center text-center py-12',
    split: 'grid grid-cols-1 md:grid-cols-2 items-center gap-8 py-12',
    overlay: 'relative min-h-[60vh] flex flex-col items-center justify-center text-center py-12',
  },
  title:
    '[font-family:var(--font-heading)] text-[length:var(--size-hero-heading)] leading-tight text-[rgb(var(--color-heading))]',
  subtitle: 'text-[16px] mt-2 [font-family:var(--font-body)] text-[rgb(var(--color-text))]',
  ctaButton:
    'inline-flex items-center justify-center h-[var(--size-hero-button-h)] rounded-[var(--radius-button)] px-4 text-[16px] [font-family:var(--font-body)] border border-[rgb(var(--color-button-2-border,var(--color-button-border)))] bg-[rgb(var(--color-button-2-bg,var(--color-button-bg)))] text-[rgb(var(--color-button-2-text,var(--color-button-text)))] hover:opacity-90 transition-colors no-underline',
  image: {
    centered: 'absolute inset-0 -z-10 object-cover w-full h-full',
    split: 'w-full aspect-[4/3] object-cover',
    overlay: 'absolute inset-0 -z-10 object-cover w-full h-full opacity-60',
  },
} as const;

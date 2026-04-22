export const HeroClasses = {
  root: 'relative w-full overflow-hidden',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4',
  inner: {
    centered: 'flex flex-col items-center text-center py-12',
    split: 'grid grid-cols-1 md:grid-cols-2 items-center gap-8 py-12',
    overlay: 'relative min-h-[60vh] flex flex-col items-center justify-center text-center py-12',
    'grid-4': 'flex flex-col items-center text-center py-12 gap-8',
  },
  title:
    '[font-family:var(--font-heading)] text-[length:var(--size-hero-heading)] leading-tight text-[rgb(var(--color-heading))]',
  subtitle: 'text-[16px] mt-2 [font-family:var(--font-body)] text-[rgb(var(--color-text))]',
  ctaButton:
    'inline-flex items-center justify-center h-[var(--size-hero-button-h)] rounded-[var(--radius-button)] px-4 text-[16px] [font-family:var(--font-body)] border border-[rgb(var(--color-button-secondary-border,var(--color-button-border)))] bg-[rgb(var(--color-button-secondary-bg,var(--color-button-bg)))] text-[rgb(var(--color-button-secondary-text,var(--color-button-text)))] hover:opacity-90 transition-colors no-underline',
  image: {
    centered: 'absolute inset-0 -z-10 object-cover w-full h-full',
    split: 'w-full aspect-[4/3] object-cover',
    overlay: 'absolute inset-0 -z-10 object-cover w-full h-full opacity-60',
    'grid-4': 'w-full aspect-square object-cover rounded-[var(--radius-media)]',
  },
  gridContainer:
    'w-full max-w-[var(--container-max-width)] grid grid-cols-2 gap-4 md:gap-6 lg:gap-8',
  gridTile:
    'relative overflow-hidden rounded-[var(--radius-media)] bg-[rgb(var(--color-surface))] aspect-square',
} as const;

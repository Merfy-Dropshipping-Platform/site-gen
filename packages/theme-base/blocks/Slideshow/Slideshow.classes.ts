export const SlideshowClasses = {
  root: 'relative w-full overflow-hidden',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4',
  slide: 'relative min-h-[60vh] flex items-center justify-center',
  image: 'absolute inset-0 -z-10 object-cover w-full h-full',
  content: 'relative z-10 text-center',
  heading:
    'font-[var(--font-heading)] text-[var(--size-hero-heading)] leading-tight text-[rgb(var(--color-heading))]',
  subtitle: 'text-lg mt-4 text-[rgb(var(--color-text))] opacity-80',
  ctaButton:
    'inline-flex items-center justify-center h-[var(--size-hero-button-h)] rounded-[var(--radius-button)] px-8 mt-8 border border-[rgb(var(--color-button-border))] bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))]',
} as const;

export const ImageWithTextClasses = {
  root: 'relative w-full',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4',
  inner: {
    imageLeft:
      'grid grid-cols-1 md:grid-cols-2 items-center gap-[var(--spacing-grid-col-gap)]',
    imageRight:
      'grid grid-cols-1 md:grid-cols-2 items-center gap-[var(--spacing-grid-col-gap)]',
  },
  imageCol: {
    imageLeft: 'md:order-1',
    imageRight: 'md:order-2',
  },
  textCol: {
    imageLeft: 'md:order-2',
    imageRight: 'md:order-1',
  },
  image:
    'w-full aspect-[4/3] object-cover rounded-[var(--radius-media)]',
  heading:
    '[font-family:var(--font-heading)] text-[var(--size-hero-heading)] text-[rgb(var(--color-heading))] leading-tight mb-6',
  text: '[font-family:var(--font-body)] text-[rgb(var(--color-text))] leading-relaxed mb-6',
  button:
    'inline-flex items-center justify-center h-[var(--size-hero-button-h)] rounded-[var(--radius-button)] px-8 border border-[rgb(var(--color-button-border))] bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))] [font-family:var(--font-body)]',
} as const;

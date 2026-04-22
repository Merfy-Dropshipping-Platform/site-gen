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
    '[font-family:var(--font-heading)] text-[length:var(--size-section-heading,1.25rem)] font-normal leading-[1.2] text-[rgb(var(--color-heading))] mb-3',
  text: '[font-family:var(--font-body)] text-[16px] font-normal leading-[1.25] text-[rgb(var(--color-text))] mb-6',
  button:
    'inline-flex items-center justify-center h-[48px] px-4 text-[16px] font-normal uppercase no-underline hover:opacity-90 transition-colors [font-family:var(--font-body)] self-start border border-[rgb(var(--color-foreground,0,0,0))] rounded-[var(--radius-button)] bg-transparent text-[rgb(var(--color-heading))]',
} as const;

export const MultiRowsClasses = {
  root: 'relative w-full',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4',
  stack: 'flex flex-col gap-y-[var(--spacing-grid-row-gap)]',
  row: {
    imageLeft:
      'grid grid-cols-1 md:grid-cols-2 gap-[var(--spacing-grid-col-gap)] items-center',
    imageRight:
      'grid grid-cols-1 md:grid-cols-2 gap-[var(--spacing-grid-col-gap)] items-center',
  },
  imageCol: {
    imageLeft: 'order-1',
    imageRight: 'order-1 md:order-2',
  },
  textCol: {
    imageLeft: 'order-2',
    imageRight: 'order-2 md:order-1',
  },
  image:
    'w-full aspect-video object-cover rounded-[var(--radius-media)]',
  rowHeading:
    'font-[var(--font-heading)] text-[var(--size-hero-heading)] leading-tight text-[rgb(var(--color-heading))] mb-4',
  rowText:
    'font-[var(--font-body)] text-base text-[rgb(var(--color-text))] leading-relaxed mb-6',
  button:
    'inline-flex items-center justify-center h-[var(--size-hero-button-h)] rounded-[var(--radius-button)] px-8 border border-[rgb(var(--color-button-border))] bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))]',
} as const;

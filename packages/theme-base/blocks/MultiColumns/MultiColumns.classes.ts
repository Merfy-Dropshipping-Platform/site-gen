export const MultiColumnsClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4',
  grid: 'grid gap-x-[var(--spacing-grid-col-gap)] gap-y-[var(--spacing-grid-row-gap)]',
  column: 'flex flex-col',
  image:
    'w-full aspect-video object-cover rounded-[var(--radius-media)] mb-4',
  columnHeading:
    '[font-family:var(--font-heading)] text-xl text-[rgb(var(--color-heading))] mb-2',
  columnText:
    '[font-family:var(--font-body)] text-base text-[rgb(var(--color-text))] leading-relaxed',
} as const;

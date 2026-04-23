export const PublicationsClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4',
  heading:
    '[font-family:var(--font-heading)] text-[var(--size-hero-heading)] text-[rgb(var(--color-heading))] mb-8 text-center',
  grid:
    'grid gap-x-[var(--spacing-grid-col-gap)] gap-y-[var(--spacing-grid-row-gap)]',
  placeholderCard:
    'block overflow-hidden rounded-[var(--radius-card)] bg-[rgb(var(--color-surface))]',
  placeholderMedia:
    'w-full aspect-[16/9] rounded-[var(--radius-media)] bg-[rgb(var(--color-bg))]',
  placeholderBody: 'px-4 py-4',
  placeholderDate:
    'h-3 w-1/3 rounded bg-[rgb(var(--color-muted))] opacity-30 mb-3',
  placeholderTitle:
    'h-5 w-3/4 rounded bg-[rgb(var(--color-muted))] opacity-40 mb-3',
  placeholderExcerpt:
    'h-3 w-full rounded bg-[rgb(var(--color-muted))] opacity-20',
} as const;

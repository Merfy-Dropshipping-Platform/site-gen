export const PopularProductsClasses = {
  root: 'relative w-full',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4',
  heading:
    '[font-family:var(--font-heading)] text-[var(--size-hero-heading)] text-[rgb(var(--color-heading))] mb-8 text-center',
  grid:
    'grid gap-x-[var(--spacing-grid-col-gap)] gap-y-[var(--spacing-grid-row-gap)]',
  placeholderCard:
    'block overflow-hidden rounded-[var(--radius-card)] bg-[rgb(var(--color-surface))]',
  placeholderMedia:
    'w-full aspect-square rounded-[var(--radius-media)] bg-[rgb(var(--color-bg))]',
  placeholderTitle:
    'mt-4 h-4 w-3/4 rounded bg-[rgb(var(--color-muted))] opacity-40',
  placeholderPrice:
    'mt-2 h-3 w-1/3 rounded bg-[rgb(var(--color-muted))] opacity-30',
  placeholderBody: 'px-3 pb-4',
} as const;

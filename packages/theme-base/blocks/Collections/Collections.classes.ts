export const CollectionsClasses = {
  root: 'relative w-full',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4',
  heading:
    '[font-family:var(--font-heading)] text-[var(--size-hero-heading)] text-[rgb(var(--color-heading))] mb-8 text-center',
  grid: 'grid gap-x-[var(--spacing-grid-col-gap)] gap-y-[var(--spacing-grid-row-gap)]',
  card: 'block overflow-hidden rounded-[var(--radius-card)]',
  image: 'w-full aspect-square object-cover rounded-[var(--radius-media)]',
  cardHeading:
    'mt-4 [font-family:var(--font-heading)] text-xl text-[rgb(var(--color-heading))]',
  cardDescription:
    'mt-2 text-sm [font-family:var(--font-body)] text-[rgb(var(--color-muted))]',
} as const;

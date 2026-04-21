export const GalleryClasses = {
  root: 'relative w-full',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4',
  heading:
    '[font-family:var(--font-heading)] text-[var(--size-hero-heading)] text-[rgb(var(--color-heading))] mb-8 text-center',
  inner: {
    grid: 'grid grid-cols-1 md:grid-cols-3 gap-x-[var(--spacing-grid-col-gap)] gap-y-[var(--spacing-grid-row-gap)]',
    'side-by-side': 'flex flex-col md:flex-row gap-[var(--spacing-grid-col-gap)]',
  },
  item: 'block overflow-hidden rounded-[var(--radius-card)]',
  image: 'w-full aspect-square object-cover rounded-[var(--radius-media)]',
  card: 'block rounded-[var(--radius-card)] bg-[rgb(var(--color-bg))] overflow-hidden',
  cardMedia: 'w-full aspect-square bg-[rgb(var(--color-bg))] rounded-[var(--radius-media)]',
  cardLabel:
    'mt-3 [font-family:var(--font-body)] text-sm text-[rgb(var(--color-text))]',
} as const;

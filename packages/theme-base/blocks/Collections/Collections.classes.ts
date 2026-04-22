export const CollectionsClasses = {
  root: 'relative w-full',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4',
  heading:
    '[font-family:var(--font-heading)] text-[length:var(--size-section-heading,1.25rem)] font-normal leading-[1.2] text-[rgb(var(--color-heading))] mb-2 text-left',
  subtitle:
    '[font-family:var(--font-body)] text-[16px] font-normal leading-[1.25] text-[rgb(var(--color-muted))] mb-8 text-left',
  grid: 'grid gap-x-[var(--spacing-grid-col-gap)] gap-y-[var(--spacing-grid-row-gap)]',
  card: 'block overflow-hidden rounded-[var(--radius-card)]',
  image: 'w-full aspect-square object-cover rounded-[var(--radius-media)]',
  cardHeading:
    'mt-4 [font-family:var(--font-heading)] text-xl text-[rgb(var(--color-heading))]',
  cardDescription:
    'mt-2 text-sm [font-family:var(--font-body)] text-[rgb(var(--color-muted))]',
} as const;

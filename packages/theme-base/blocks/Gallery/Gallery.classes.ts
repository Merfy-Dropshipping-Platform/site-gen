// Gallery — pixel-matched to Figma Rose 669:17976. Layout "featured"
// (default when item count >= 3): 1 large tile left spanning 2 rows +
// 2 smaller tiles stacked on the right, each with a short label
// underneath (e.g. "Сумка 5 990₽", "Коллекция FUTURISM"). Layout
// "grid" keeps the old 3-column equal-thumbnail grid as a fallback.
export const GalleryClasses = {
  root:
    'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container:
    'mx-auto max-w-[var(--container-max-width)] px-4',
  heading:
    '[font-family:var(--font-heading)] text-[14px] leading-[16px] tracking-[0.1em] uppercase text-[rgb(var(--color-heading))] text-center mb-2',
  subheading:
    '[font-family:var(--font-body)] text-[12px] leading-[15px] text-[rgb(var(--color-text))]/60 text-center mb-8',
  inner: {
    grid:
      'grid grid-cols-1 md:grid-cols-3 gap-x-[var(--spacing-grid-col-gap)] gap-y-[var(--spacing-grid-row-gap)]',
    'side-by-side':
      'flex flex-col md:flex-row gap-[var(--spacing-grid-col-gap)]',
    featured:
      'grid grid-cols-1 md:grid-cols-3 md:grid-rows-2 gap-4 md:gap-6',
  },
  itemPrimary:
    'md:col-span-2 md:row-span-2 overflow-hidden rounded-[var(--radius-media)] bg-[rgb(var(--color-surface))]',
  itemSmall:
    'flex flex-col gap-2 overflow-hidden',
  item:
    'block overflow-hidden rounded-[var(--radius-card)]',
  image:
    'w-full h-full object-cover rounded-[var(--radius-media)]',
  imageSmall:
    'w-full aspect-square object-cover rounded-[var(--radius-media)] bg-[rgb(var(--color-surface))]',
  card:
    'flex flex-col gap-2',
  cardMedia:
    'w-full aspect-square bg-[rgb(var(--color-surface))] rounded-[var(--radius-media)]',
  cardLabel:
    '[font-family:var(--font-body)] text-[14px] leading-[17px] text-[rgb(var(--color-heading))]',
  cardPrice:
    '[font-family:var(--font-body)] text-[14px] leading-[17px] text-[rgb(var(--color-text))]/70',
} as const;

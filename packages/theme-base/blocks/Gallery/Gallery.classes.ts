// Gallery — pixel-matched to Figma Rose 669:17976. Layout "featured"
// (default when item count >= 3): 1 large tile left spanning 2 rows +
// 2 smaller tiles stacked on the right, each with a short label
// underneath (e.g. "Сумка 5 990₽", "Коллекция FUTURISM"). Layout
// "grid" keeps the old 3-column equal-thumbnail grid as a fallback.
export const GalleryClasses = {
  root:
    'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))] px-[var(--gallery-root-padding-x)] sm:px-[var(--gallery-root-padding-x-sm)] md:px-[var(--gallery-root-padding-x-md)] lg:px-[var(--gallery-root-padding-x-lg)] xl:px-[var(--gallery-root-padding-x-xl)] 2xl:px-[var(--gallery-root-padding-x-2xl)] pb-[var(--gallery-root-padding-bottom)] sm:pb-[var(--gallery-root-padding-bottom-sm)] md:pb-[var(--gallery-root-padding-bottom-md)] lg:pb-[var(--gallery-root-padding-bottom-lg)] xl:pb-[var(--gallery-root-padding-bottom-xl)] pt-[var(--gallery-root-padding-top)] sm:pt-[var(--gallery-root-padding-top-sm)] md:pt-[var(--gallery-root-padding-top-md)] lg:pt-[var(--gallery-root-padding-top-lg)] xl:pt-[var(--gallery-root-padding-top-xl)]',
  container:
    'mx-auto max-w-[var(--gallery-container-max-width)] px-4 gap-[var(--gallery-container-gap)] md:gap-[var(--gallery-container-gap-md)]',
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
    'md:col-span-2 md:row-span-2 overflow-hidden rounded-[var(--gallery-item-primary-border-radius)] bg-[rgb(var(--color-surface))] min-h-[var(--gallery-item-primary-min-height)]',
  itemSmall:
    'flex flex-col gap-[var(--gallery-item-small-gap)] overflow-hidden md:gap-[var(--gallery-item-small-gap-md)]',
  item:
    'block overflow-hidden rounded-[var(--radius-card)]',
  image:
    'w-full h-full object-cover rounded-[var(--radius-media)]',
  imageSmall:
    'w-full aspect-square object-cover rounded-[var(--radius-media)] bg-[rgb(var(--color-surface))]',
  card:
    'flex flex-col gap-2',
  cardMedia:
    'w-full aspect-square bg-[rgb(var(--color-surface))] rounded-[var(--gallery-card-media-border-radius)]',
  cardLabel:
    '[font-family:var(--font-body)] text-[var(--gallery-card-label-font-size)] leading-[17px] text-[rgb(var(--color-heading))]',
  cardPrice:
    '[font-family:var(--font-body)] text-[var(--gallery-card-price-color)] leading-[17px] text-[rgb(var(--color-text))]/70',
} as const;

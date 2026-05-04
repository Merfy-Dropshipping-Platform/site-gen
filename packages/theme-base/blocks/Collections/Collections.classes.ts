// Collections — pixel-matched to Figma Rose 669:17951. Section title is
// centered 14px uppercase tracked, subheading grey and centered, then an
// equal-width grid of tall portrait tiles (aspect 3:4) with a small
// centered label under each ("Коллекция RIVIERA", etc.).
export const CollectionsClasses = {
  root:
    'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container:
    'mx-auto max-w-[var(--container-max-width)] px-4',
  heading:
    '[font-family:var(--font-heading)] text-[14px] leading-[16px] tracking-[0.1em] uppercase text-[rgb(var(--color-heading))] text-center mb-2',
  subtitle:
    '[font-family:var(--font-body)] text-[12px] leading-[15px] text-[rgb(var(--color-text))]/60 text-center mb-10',
  grid:
    'grid gap-x-[var(--spacing-grid-col-gap)] gap-y-[var(--spacing-grid-row-gap)]',
  card:
    'block overflow-hidden group',
  image:
    'w-full aspect-[3/4] object-cover rounded-[var(--radius-media)] bg-[rgb(var(--color-surface))] transition-transform duration-500 ease-out group-hover:scale-105',
  cardHeading:
    'mt-3 [font-family:var(--font-body)] text-[14px] leading-[17px] text-[rgb(var(--color-heading))] text-center',
  cardDescription:
    'mt-1 text-[12px] leading-[15px] [font-family:var(--font-body)] text-[rgb(var(--color-text))]/60 text-center',
  /**
   * 084 vanilla pilot — additive `cardCaptionStyle` variant. Default keeps
   * pre-commit casing. `uppercase` adds tracking + uppercasing for vanilla
   * home tiles.
   */
  cardCaption: {
    default: '',
    uppercase: 'uppercase tracking-[0.1em]',
  },
  /**
   * 084 vanilla pilot — additive `gridAspect` variant. Default `auto`
   * preserves the existing `imageView` aspect map (no class added).
   * `1:1` forces a square tile via Tailwind `aspect-square`.
   */
  gridAspect: {
    auto: '',
    '1:1': 'aspect-square',
  },
} as const;

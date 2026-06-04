// Collections — pixel-matched to Figma Rose 669:17951. Section title is
// centered 14px uppercase tracked, subheading grey and centered, then an
// equal-width grid of tall portrait tiles (aspect 3:4) with a small
// centered label under each ("Коллекция RIVIERA", etc.).
export const CollectionsClasses = {
  root:
    'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))] px-[var(--collections-root-padding-x)] pb-[var(--collections-root-padding-bottom)] pt-[var(--collections-root-padding-top)] sm:px-[var(--collections-root-padding-x-sm)] sm:pb-[var(--collections-root-padding-bottom-sm)] sm:pt-[var(--collections-root-padding-top-sm)] md:px-[var(--collections-root-padding-x-md)] md:pb-[var(--collections-root-padding-bottom-md)] md:pt-[var(--collections-root-padding-top-md)] lg:px-[var(--collections-root-padding-x-lg)] lg:pb-[var(--collections-root-padding-bottom-lg)] lg:pt-[var(--collections-root-padding-top-lg)] xl:px-[var(--collections-root-padding-x-xl)] xl:pb-[var(--collections-root-padding-bottom-xl)] xl:pt-[var(--collections-root-padding-top-xl)] 2xl:px-[var(--collections-root-padding-x-2xl)]',
  container:
    'mx-auto max-w-[var(--collections-container-max-width)] px-4 w-[var(--collections-container-width)] gap-[var(--collections-container-gap)] md:gap-[var(--collections-container-gap-md)]',
  // Размеры заголовка/подзаголовка — не зашиваем, чтобы titleSizeClass /
  // subtitleSizeClass из sidebar (small/medium/large) реально применялись.
  // Раньше зашитый `text-[14px]` (arbitrary value) перебивал utility-классы
  // в каскаде → ползунок Размер не работал.
  heading:
    '[font-family:var(--font-heading)] tracking-[0.1em] uppercase text-[rgb(var(--color-heading))] mb-2',
  subtitle:
    '[font-family:var(--font-body)] text-[rgb(var(--color-text))]/60 mb-10',
  grid:
    'grid gap-x-[var(--spacing-grid-col-gap)] gap-y-[var(--spacing-grid-row-gap)] gap-[var(--collections-grid-gap)] sm:gap-[var(--collections-grid-gap-sm)] md:gap-[var(--collections-grid-gap-md)] lg:gap-[var(--collections-grid-gap-lg)]',
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

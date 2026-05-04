// PopularProducts — pixel-matched to Figma Rose 669:17968. Centered
// section title (14px uppercase tracked) + grey subheading, then a row
// of square product tiles with "Сумка" label + "5990 ₽" price (optional
// grey strikethrough oldPrice for discounted items).
export const PopularProductsClasses = {
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
    'flex flex-col gap-3 items-stretch group',
  cardMedia:
    'relative w-full aspect-square rounded-[var(--radius-media)] bg-[rgb(var(--color-surface))] overflow-hidden flex items-center justify-center text-[rgb(var(--color-text))]/40',
  cardBadge:
    'absolute top-3 left-3 inline-flex items-center justify-center h-6 px-2 rounded-[var(--radius-button)] bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))] [font-family:var(--font-body)] text-[11px] leading-none',
  cardTitle:
    '[font-family:var(--font-body)] text-[14px] leading-[17px] text-[rgb(var(--color-heading))]',
  cardPriceRow:
    'flex gap-2 items-center',
  cardPrice:
    '[font-family:var(--font-body)] text-[14px] leading-[17px] text-[rgb(var(--color-heading))]',
  cardOldPrice:
    '[font-family:var(--font-body)] text-[12px] leading-[15px] text-[rgb(var(--color-text))]/50 line-through',
  cardCta:
    'mt-3 inline-flex h-[44px] items-center justify-center px-4 text-[14px] font-medium uppercase tracking-wide rounded-[var(--radius-button)] [font-family:var(--font-body)] bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))] border border-[rgb(var(--color-button-border))] hover:opacity-90 transition-opacity no-underline',
  cardBadgeNew:
    'absolute top-3 left-3 inline-flex items-center justify-center h-6 px-2 rounded-[var(--radius-button)] bg-[rgb(var(--color-accent))] text-white [font-family:var(--font-body)] text-[11px] leading-none',
  cardBadgeSale:
    'absolute top-11 left-3 inline-flex items-center justify-center h-6 px-2 rounded-[var(--radius-button)] bg-[rgb(var(--color-accent))] text-white [font-family:var(--font-body)] text-[11px] leading-none',
  // Legacy skeleton placeholders, still referenced by older render paths.
  placeholderCard:
    'block overflow-hidden rounded-[var(--radius-card)] bg-[rgb(var(--color-surface))]',
  placeholderMedia:
    'w-full aspect-square rounded-[var(--radius-media)] bg-[rgb(var(--color-bg))]',
  placeholderTitle:
    'mt-4 h-4 w-3/4 rounded bg-[rgb(var(--color-muted))] opacity-40',
  placeholderPrice:
    'mt-2 h-3 w-1/3 rounded bg-[rgb(var(--color-muted))] opacity-30',
  placeholderBody: 'px-3 pb-4',
  /**
   * 084 vanilla pilot — additive `swatchOverlay` variant. Three small
   * pips rendered absolutely top-right over the card media. Colors come
   * from the variant options' swatch attribute (or a fallback gradient
   * of `--color-foreground/--color-text`).
   */
  swatchOverlay: {
    container: 'absolute top-3 right-3 inline-flex gap-1.5 z-10',
    dot:
      'w-2.5 h-2.5 rounded-full border border-[rgb(var(--color-foreground)/0.2)] bg-[rgb(var(--color-surface))]',
  },
} as const;

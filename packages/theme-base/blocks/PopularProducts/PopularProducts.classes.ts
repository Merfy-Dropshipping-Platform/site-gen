// PopularProducts — pixel-matched to Figma Rose 669:17968. Centered
// section title (14px uppercase tracked) + grey subheading, then a row
// of square product tiles with "Сумка" label + "5990 ₽" price (optional
// grey strikethrough oldPrice for discounted items).
export const PopularProductsClasses = {
  // Эталон rose.merfy.ru #popular section: responsive section padding через
  // токены (base-defaults exact match: 56→64→100→120→140 py, 16→20→40→64→80→280 px),
  // ВНУТРЕННИЙ container 1320px центрированный без своего padding-x (root
  // уже обеспечивает), card gap-5 = 20px (rose theme.json --popular-products-card-gap),
  // card media portrait aspect через hardcoded design invariant.
  root:
    'relative w-full bg-[var(--popular-products-root-background-color)] text-[rgb(var(--color-text))] px-[var(--popular-products-root-padding-x)] pb-[var(--popular-products-root-padding-bottom)] pt-[var(--popular-products-root-padding-top)] sm:px-[var(--popular-products-root-padding-x-sm)] sm:pb-[var(--popular-products-root-padding-bottom-sm)] sm:pt-[var(--popular-products-root-padding-top-sm)] md:px-[var(--popular-products-root-padding-x-md)] md:pb-[var(--popular-products-root-padding-bottom-md)] md:pt-[var(--popular-products-root-padding-top-md)] lg:px-[var(--popular-products-root-padding-x-lg)] lg:pb-[var(--popular-products-root-padding-bottom-lg)] lg:pt-[var(--popular-products-root-padding-top-lg)] xl:px-[var(--popular-products-root-padding-x-xl)] xl:pb-[var(--popular-products-root-padding-bottom-xl)] xl:pt-[var(--popular-products-root-padding-top-xl)] 2xl:px-[var(--popular-products-root-padding-x-2xl)]',
  container:
    'mx-auto flex w-full max-w-[var(--popular-products-container-max-width)] flex-col gap-[var(--popular-products-container-gap)] md:gap-[var(--popular-products-container-gap-md)]',
  headerGroup:
    'flex w-full justify-center',
  headerInner:
    'flex max-w-[90vw] flex-col items-center gap-2',
  heading:
    '[font-family:var(--font-heading)] text-center font-normal uppercase text-[rgb(var(--color-heading))] !text-[20px] !leading-none tracking-normal',
  subtitle:
    '[font-family:var(--font-body)] text-center font-normal text-[rgb(var(--color-muted))] max-w-[780px] px-2 !text-[16px] !leading-none tracking-normal',
  grid:
    'grid w-full gap-x-3 gap-y-8 sm:gap-x-4 sm:gap-y-9 md:gap-x-4 md:gap-y-10 xl:gap-x-5',
  card:
    'flex flex-col gap-5 items-stretch group w-full',
  // Card media — portrait aspect эталон rose.merfy.ru (318/444 ≈ 0.72:1).
  // rounded-[8px] = --radius-media token (slider mediaRadius в ThemeSettings).
  cardMedia:
    'relative w-full aspect-[318/444] rounded-[var(--radius-media)] bg-[rgb(var(--color-surface))] overflow-hidden flex items-center justify-center text-[rgb(var(--color-text))]/40 border-[length:var(--size-card-border,0px)] border-[rgb(var(--color-text))]/10',
  cardBadge:
    'absolute top-3 left-3 inline-flex items-center justify-center h-6 px-2 rounded-[var(--popular-products-card-badge-border-radius)] bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))] [font-family:var(--font-body)] text-[var(--popular-products-card-badge-font-size)] leading-none min-w-[var(--popular-products-card-badge-min-width)]',
  cardTitle:
    '[font-family:var(--font-body)] text-[14px] leading-[17px] text-[rgb(var(--color-heading))] w-[var(--popular-products-card-title-width)] hover:opacity-[var(--popular-products-card-title-opacity-hover)]',
  cardPriceRow:
    'flex gap-2 items-center',
  cardPrice:
    '[font-family:var(--font-body)] text-[14px] leading-[17px] text-[rgb(var(--color-text))]',
  cardOldPrice:
    '[font-family:var(--font-body)] text-[12px] leading-[15px] text-[rgb(var(--color-text))]/50 line-through text-[var(--popular-products-card-old-price-color)]',
  cardCta:
    'mt-3 inline-flex h-[44px] items-center justify-center px-4 text-[14px] font-medium uppercase tracking-wide rounded-[var(--radius-button)] [font-family:var(--font-body)] bg-[rgb(var(--color-button-bg))]! text-[rgb(var(--color-button-text))]! border border-[rgb(var(--color-button-border))] hover:bg-[rgb(var(--color-button-bg-hover))]! hover:text-[rgb(var(--color-button-text-hover))]! transition-colors no-underline',
  cardBadgeNew:
    'absolute top-3 left-3 inline-flex items-center justify-center h-6 px-2 rounded-[var(--radius-button)] bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))] [font-family:var(--font-body)] text-[11px] leading-none',
  cardBadgeSale:
    'absolute top-11 left-3 inline-flex items-center justify-center h-6 px-2 rounded-[var(--radius-button)] bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))] [font-family:var(--font-body)] text-[11px] leading-none',
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
   * 084 vanilla pilot — additive `swatchOverlay` variant. Pips rendered
   * absolutely bottom-right over the card media (per Figma 1:19004). Pip
   * count and colors derive from the product's `variants[]`/`variantSwatches[]`
   * — overlay is hidden entirely when the product has no variants.
   * Colors fall back to a neutral foreground/surface palette when individual
   * swatch hex values are not available.
   *
   * 088 G3 fix (commit follows audit Phase 3 finding) — moved from `top-3`
   * to `bottom-3` per Figma `1:19004`; conditional rendering enforced in
   * `PopularProducts.astro` so demo placeholders no longer show neutral
   * pips on every card.
   */
  swatchOverlay: {
    container: 'absolute bottom-3 right-3 inline-flex gap-1.5 z-10',
    dot:
      'w-2.5 h-2.5 rounded-full border border-[rgb(var(--color-text)/0.2)] bg-[rgb(var(--color-surface))]',
  },
  // Empty-state when realProducts.length === 0 (seed site без товаров).
  // Renders inside grid as full-width row (col-span: 1 / -1) so inline-script
  // can replace grid.innerHTML when API returns products.
  emptyState:
    '[grid-column:1/-1] flex flex-col items-center justify-center gap-3 py-16 text-[rgb(var(--color-text))]/50',
  emptyStateIcon:
    'opacity-40',
  emptyStateText:
    '[font-family:var(--font-body)] text-[14px] leading-[17px]',
} as const;

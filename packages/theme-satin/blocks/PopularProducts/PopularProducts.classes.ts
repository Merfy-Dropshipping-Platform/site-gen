// Satin PopularProducts — pixel-matched to Figma 422:8955
// (Коллекция товаров; 1920; 3col; Без контейнера; Портрет).
// 1920: 3-col grid 429x679 (photo 429x529 = aspect 429/529), gap-16,
// header gap-4 (24px heading + 20px gray subtitle), bottom "Смотреть ещё"
// CTA h-56 px-20 black, per-card "В корзину" h-48 w-full black, 0px radii.
export const PopularProductsClasses = {
  root:
    'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container:
    'mx-auto max-w-[var(--container-max-width)] px-[40px] flex flex-col gap-[40px] items-start',
  headerGroup:
    'flex flex-col gap-[4px] items-start',
  heading:
    '[font-family:var(--font-heading)] text-[24px] leading-[normal] uppercase text-[rgb(var(--color-heading))] text-left',
  subtitle:
    '[font-family:var(--font-body)] text-[20px] leading-[normal] text-[rgb(var(--color-muted))] text-left',
  grid:
    'grid gap-x-[16px] gap-y-[40px] w-full items-stretch',
  card:
    'relative flex flex-col gap-[20px] items-stretch group',
  cardMedia:
    'relative w-full aspect-[429/529] bg-[rgb(var(--color-surface))] overflow-hidden flex items-center justify-center text-[rgb(var(--color-text))]/40',
  cardBadge:
    'absolute top-[8px] left-[8px] inline-flex items-center justify-center h-[24px] px-[6px] bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))] [font-family:var(--font-body)] text-[12px] leading-none uppercase',
  cardBadgeNew:
    'absolute top-[8px] left-[8px] inline-flex items-center justify-center h-[24px] px-[6px] bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))] [font-family:var(--font-body)] text-[12px] leading-none uppercase',
  cardBadgeSale:
    'absolute top-[40px] left-[8px] inline-flex items-center justify-center h-[24px] px-[6px] bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))] [font-family:var(--font-body)] text-[12px] leading-none uppercase',
  cardTitle:
    '[font-family:var(--font-body)] text-[16px] leading-[normal] uppercase text-[rgb(var(--color-heading))] text-left',
  cardPriceRow:
    'flex gap-[8px] items-center',
  cardPrice:
    '[font-family:var(--font-body)] text-[16px] leading-[normal] text-[rgb(var(--color-heading))]',
  cardOldPrice:
    '[font-family:var(--font-body)] text-[14px] leading-[normal] text-[rgb(var(--color-muted))] line-through',
  cardCta:
    'mt-[12px] inline-flex h-[48px] w-full items-center justify-center px-[20px] bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))] [font-family:var(--font-body)] text-[14px] leading-none uppercase tracking-[0.05em] no-underline hover:opacity-90 transition-opacity',
  viewAllCta:
    'inline-flex h-[56px] items-center justify-center px-[20px] bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))] [font-family:var(--font-body)] text-[16px] leading-none uppercase tracking-[0.05em] no-underline hover:opacity-90 transition-opacity self-start',
  placeholderCard:
    'block overflow-hidden bg-[rgb(var(--color-surface))]',
  placeholderMedia:
    'w-full aspect-[429/529] bg-[rgb(var(--color-bg))]',
  placeholderTitle:
    'mt-4 h-4 w-3/4 bg-[rgb(var(--color-muted))] opacity-40',
  placeholderPrice:
    'mt-2 h-3 w-1/3 bg-[rgb(var(--color-muted))] opacity-30',
  placeholderBody: 'px-3 pb-4',
} as const;

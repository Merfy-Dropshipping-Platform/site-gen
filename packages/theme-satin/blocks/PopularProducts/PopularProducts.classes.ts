// Satin PopularProducts — pixel-matched to Figma 734:4892 (Популярные товары Satin).
// 3-column portrait grid (429x564), left-aligned Arsenal 16px uppercase title,
// strikethrough grey old price, black 'Скидка' badge top-left, flat 0px radii.
export const PopularProductsClasses = {
  root:
    'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container:
    'mx-auto max-w-[var(--container-max-width)] px-[40px]',
  heading:
    '[font-family:var(--font-heading)] text-[20px] leading-[normal] uppercase text-[rgb(var(--color-heading))] text-left mb-6',
  subtitle:
    '[font-family:var(--font-body)] text-[16px] leading-[normal] text-[rgb(var(--color-muted))] text-left mb-6',
  grid:
    'grid gap-x-[16px] gap-y-[40px]',
  card:
    'flex flex-col gap-[20px] items-stretch group',
  cardMedia:
    'relative w-full aspect-[430/564] bg-[rgb(var(--color-surface))] overflow-hidden flex items-center justify-center text-[rgb(var(--color-text))]/40',
  cardBadge:
    'absolute top-[12px] left-[12px] inline-flex items-center justify-center h-[28px] px-[10px] bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))] [font-family:var(--font-body)] text-[12px] leading-none uppercase',
  cardTitle:
    '[font-family:var(--font-body)] text-[16px] leading-[normal] uppercase text-[rgb(var(--color-heading))] text-left',
  cardPriceRow:
    'flex gap-[12px] items-center',
  cardPrice:
    '[font-family:var(--font-body)] text-[16px] leading-[normal] text-[rgb(var(--color-heading))]',
  cardOldPrice:
    '[font-family:var(--font-body)] text-[14px] leading-[normal] text-[rgb(var(--color-muted))] line-through',
  placeholderCard:
    'block overflow-hidden bg-[rgb(var(--color-surface))]',
  placeholderMedia:
    'w-full aspect-[430/564] bg-[rgb(var(--color-bg))]',
  placeholderTitle:
    'mt-4 h-4 w-3/4 bg-[rgb(var(--color-muted))] opacity-40',
  placeholderPrice:
    'mt-2 h-3 w-1/3 bg-[rgb(var(--color-muted))] opacity-30',
  placeholderBody: 'px-3 pb-4',
} as const;

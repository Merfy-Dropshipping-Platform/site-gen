// BlogSection — страница блога: заголовок (название блога), сетка карточек
// записей и переход по страницам. Карточка — та же, что у секции
// «Публикации» (обложка 4:3, дата, заголовок, анонс).
//
// Критичная раскладка (сетка, скрытие чужих страниц) продублирована
// scoped-стилем в BlogSection.astro — как у Publications, чтобы страница
// читалась, даже если утилита не попала в CSS темы.
export const BlogSectionClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4 sm:px-5 md:px-10',
  heading:
    '[font-family:var(--font-heading)] text-[28px] sm:text-[36px] leading-[1.2] font-normal text-[rgb(var(--color-heading))] mb-10',
  grid: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-[var(--spacing-grid-col-gap)] gap-y-[var(--spacing-grid-row-gap)]',
  card: 'flex flex-col gap-4 group no-underline',
  cardMedia:
    'relative w-full aspect-[4/3] rounded-[var(--radius-media)] bg-[rgb(var(--color-surface))] overflow-hidden',
  cardMediaImg: 'block h-full w-full object-cover',
  cardBody: 'flex flex-col gap-2 px-1',
  cardDate: '[font-family:var(--font-body)] text-[13px] leading-[16px] text-[rgb(var(--color-text))]/60',
  cardTitle:
    '[font-family:var(--font-heading)] text-[18px] leading-[24px] text-[rgb(var(--color-heading))] group-hover:underline underline-offset-4',
  cardExcerpt: '[font-family:var(--font-body)] text-[14px] leading-[20px] text-[rgb(var(--color-text))]/75',
  empty: '[font-family:var(--font-body)] text-[16px] text-[rgb(var(--color-muted))] py-12',
  pagination: 'flex items-center justify-center gap-2 mt-12 [font-family:var(--font-body)]',
  pageLink:
    'flex items-center justify-center min-w-10 h-10 px-2 text-[16px] text-[rgb(var(--color-muted))] no-underline hover:text-[rgb(var(--color-heading))]',
  pageLinkActive:
    'flex items-center justify-center min-w-10 h-10 px-2 text-[16px] text-[rgb(var(--color-heading))] font-semibold',
  pageEllipsis: 'flex items-center justify-center min-w-10 h-10 text-[rgb(var(--color-muted))]',
  pageArrow:
    'flex items-center justify-center w-10 h-10 text-[rgb(var(--color-heading))] no-underline',
  pageArrowDisabled: 'flex items-center justify-center w-10 h-10 text-[rgb(var(--color-muted))] opacity-40',
} as const;

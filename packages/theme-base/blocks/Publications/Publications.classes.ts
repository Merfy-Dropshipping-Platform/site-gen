// Publications — renders a grid of article cards (image + date + title +
// excerpt). Section title uses Rose's 14px uppercase tracked style. When
// no real articles are wired, shows demo content so seed sites never look
// blank. Legacy skeleton classes kept for older render paths.
export const PublicationsClasses = {
  root:
    'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container:
    'mx-auto max-w-[var(--container-max-width)] px-4',
  heading:
    '[font-family:var(--font-heading)] text-[14px] leading-[16px] tracking-[0.1em] uppercase text-[rgb(var(--color-heading))] text-center mb-10',
  grid:
    'grid gap-x-[var(--spacing-grid-col-gap)] gap-y-[var(--spacing-grid-row-gap)]',
  card:
    'flex flex-col gap-4 group',
  cardMedia:
    'w-full aspect-[4/3] rounded-[var(--radius-media)] bg-[rgb(var(--color-surface))] overflow-hidden flex items-center justify-center text-[rgb(var(--color-text))]/30',
  cardBody:
    'flex flex-col gap-2 px-1',
  cardDate:
    '[font-family:var(--font-body)] text-[12px] leading-[15px] text-[rgb(var(--color-text))]/50',
  cardTitle:
    '[font-family:var(--font-body)] text-[14px] leading-[18px] text-[rgb(var(--color-heading))]',
  cardExcerpt:
    '[font-family:var(--font-body)] text-[12px] leading-[15px] text-[rgb(var(--color-text))]/70',
  placeholderCard:
    'block overflow-hidden rounded-[var(--radius-card)] bg-[rgb(var(--color-surface))]',
  placeholderMedia:
    'w-full aspect-[16/9] rounded-[var(--radius-media)] bg-[rgb(var(--color-bg))]',
  placeholderBody: 'px-4 py-4',
  placeholderDate:
    'h-3 w-1/3 rounded bg-[rgb(var(--color-muted))] opacity-30 mb-3',
  placeholderTitle:
    'h-5 w-3/4 rounded bg-[rgb(var(--color-muted))] opacity-40 mb-3',
  placeholderExcerpt:
    'h-3 w-full rounded bg-[rgb(var(--color-muted))] opacity-20',
} as const;

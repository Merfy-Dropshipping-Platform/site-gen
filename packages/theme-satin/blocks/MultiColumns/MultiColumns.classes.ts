// Satin MultiColumns — pixel-matched to Figma (Мультиколонны Satin).
// 3-col default, edge-to-edge 1320px container with 40px gutters, 24px col gap,
// Arsenal 16px uppercase column headings (like the collection labels).
export const MultiColumnsClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container: 'mx-auto max-w-[var(--container-max-width)] px-[40px]',
  grid: 'grid gap-x-[24px] gap-y-[40px]',
  column: 'flex flex-col gap-[12px]',
  image:
    'w-full aspect-[4/3] object-cover bg-[rgb(var(--color-surface))]',
  columnHeading:
    '[font-family:var(--font-body)] text-[16px] leading-[normal] uppercase text-[rgb(var(--color-heading))] text-left',
  columnText:
    '[font-family:var(--font-body)] text-[14px] leading-[1.5] text-[rgb(var(--color-text))] text-left',
} as const;

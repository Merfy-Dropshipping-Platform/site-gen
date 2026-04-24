// Satin Collections — pixel-matched to Figma 681:11702 (Список коллекций).
// 3-column portrait grid, edge-to-edge at 1320px container, 16px col gap,
// label Arsenal 16px uppercase LEFT-aligned, 20px gap between image and label.
// Flat 0px radii, no hover scale (editorial mood).
export const CollectionsClasses = {
  root:
    'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container:
    'mx-auto max-w-[var(--container-max-width)] px-[40px]',
  heading:
    '[font-family:var(--font-heading)] text-[20px] leading-[normal] uppercase text-[rgb(var(--color-heading))] text-left mb-2',
  subtitle:
    '[font-family:var(--font-body)] text-[16px] leading-[normal] text-[rgb(var(--color-muted))] text-left mb-6',
  grid:
    'grid gap-x-[16px] gap-y-[40px]',
  card:
    'flex flex-col gap-[20px] group',
  image:
    'w-full aspect-[430/564] object-cover bg-[rgb(var(--color-surface))]',
  cardHeading:
    '[font-family:var(--font-body)] text-[16px] leading-[normal] text-[rgb(var(--color-heading))] text-left uppercase',
  cardDescription:
    '[font-family:var(--font-body)] text-[14px] leading-[normal] text-[rgb(var(--color-muted))] text-left',
} as const;

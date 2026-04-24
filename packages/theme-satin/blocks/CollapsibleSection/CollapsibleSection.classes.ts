// Satin CollapsibleSection — pixel-matched to Figma.
// Flat borders (zero radii), Kelly Slab 32px uppercase section heading,
// Arsenal 16px uppercase summary, hairline divider between items.
export const CollapsibleSectionClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container: 'mx-auto max-w-[var(--container-max-width)] px-[40px]',
  heading:
    '[font-family:var(--font-heading)] text-[32px] leading-[normal] uppercase text-[rgb(var(--color-heading))] mb-[40px] text-left',
  list: 'flex flex-col border-t border-[rgb(var(--color-text))]/20',
  item:
    'border-b border-[rgb(var(--color-text))]/20 bg-transparent',
  summary:
    'cursor-pointer list-none [font-family:var(--font-body)] text-[16px] uppercase text-[rgb(var(--color-heading))] py-[20px] flex items-center justify-between',
  content:
    '[font-family:var(--font-body)] text-[16px] text-[rgb(var(--color-text))] leading-[1.5] pb-[24px]',
} as const;

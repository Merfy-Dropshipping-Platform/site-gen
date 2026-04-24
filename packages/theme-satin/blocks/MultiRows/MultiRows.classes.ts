// Satin MultiRows — pixel-matched to Figma (Мультиряды Satin).
// Alternating 2-col rows, edge-to-edge 1320px container with 40px gutters,
// Kelly Slab 32px uppercase row headings, Arsenal 16px body, solid-black Manrope
// uppercase CTA with zero radii.
export const MultiRowsClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container: 'mx-auto max-w-[var(--container-max-width)] px-[40px]',
  stack: 'flex flex-col gap-[80px]',
  row: {
    imageLeft:
      'grid grid-cols-1 md:grid-cols-2 gap-[40px] items-center',
    imageRight:
      'grid grid-cols-1 md:grid-cols-2 gap-[40px] items-center',
  },
  imageCol: {
    imageLeft: 'order-1',
    imageRight: 'order-1 md:order-2',
  },
  textCol: {
    imageLeft: 'order-2 flex flex-col gap-[24px] px-[40px]',
    imageRight: 'order-2 md:order-1 flex flex-col gap-[24px] px-[40px]',
  },
  image:
    'w-full aspect-[640/560] object-cover',
  rowHeading:
    '[font-family:var(--font-heading)] text-[32px] leading-[normal] uppercase text-[rgb(var(--color-heading))] text-left',
  rowText:
    '[font-family:var(--font-body)] text-[16px] leading-[1.5] text-[rgb(var(--color-text))] text-left',
  button:
    'inline-flex self-start items-center justify-center h-[48px] px-[32px] [font-family:var(--font-body)] text-[14px] uppercase tracking-[0.05em] bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))] border border-[rgb(var(--color-button-border))]',
} as const;

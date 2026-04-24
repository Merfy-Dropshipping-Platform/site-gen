// Satin ImageWithText — pixel-matched to Figma (Изображение + текст Satin).
// Edge-to-edge 1320px container, 50/50 split, Kelly Slab 32px uppercase heading,
// Arsenal 16px body, zero-radius black CTA.
export const ImageWithTextClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container: 'mx-auto max-w-[var(--container-max-width)] px-[40px]',
  inner: {
    imageLeft:
      'grid grid-cols-1 md:grid-cols-2 items-center gap-[40px]',
    imageRight:
      'grid grid-cols-1 md:grid-cols-2 items-center gap-[40px]',
  },
  imageCol: {
    imageLeft: 'md:order-1',
    imageRight: 'md:order-2',
  },
  textCol: {
    imageLeft: 'md:order-2 flex flex-col gap-[24px]',
    imageRight: 'md:order-1 flex flex-col gap-[24px]',
  },
  image:
    'w-full aspect-[640/560] object-cover',
  heading:
    '[font-family:var(--font-heading)] text-[32px] leading-[normal] uppercase text-[rgb(var(--color-heading))]',
  text: '[font-family:var(--font-body)] text-[16px] leading-[1.5] text-[rgb(var(--color-text))]',
  button:
    'inline-flex self-start items-center justify-center h-[48px] px-[32px] [font-family:var(--font-body)] text-[14px] uppercase tracking-[0.05em] bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))] border border-[rgb(var(--color-button-border))]',
} as const;

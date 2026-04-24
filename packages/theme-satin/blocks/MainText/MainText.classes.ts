// Satin MainText — pixel-matched to Figma (Основной текст Satin).
// Kelly Slab 40px uppercase heading + Arsenal 16px body, centered by default,
// edge-to-edge 1320px container with 40px side padding, zero-radius CTA.
export const MainTextClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container: 'mx-auto max-w-[var(--container-max-width)] px-[40px]',
  heading:
    '[font-family:var(--font-heading)] leading-[normal] uppercase text-[rgb(var(--color-heading))] mb-4',
  headingSize: {
    small: 'text-[32px]',
    medium: 'text-[40px]',
    large: 'text-[48px] sm:text-[56px]',
  },
  text: '[font-family:var(--font-body)] text-[16px] font-normal leading-[1.5] text-[rgb(var(--color-text))]',
  align: {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  },
  ctaWrap: 'mt-8 flex',
  ctaWrapAlign: {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end',
  },
  cta: {
    primary:
      '[font-family:var(--font-body)] inline-flex h-[48px] items-center justify-center px-[32px] text-[14px] uppercase tracking-[0.05em] bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))] border border-[rgb(var(--color-button-border))]',
    black:
      '[font-family:var(--font-body)] inline-flex h-[48px] items-center justify-center px-[32px] text-[14px] uppercase tracking-[0.05em] bg-black text-white border border-black',
    white:
      '[font-family:var(--font-body)] inline-flex h-[48px] items-center justify-center px-[32px] text-[14px] uppercase tracking-[0.05em] bg-white text-black border border-black',
  },
} as const;

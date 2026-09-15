// Bloom override — дословная копия канона packages/theme-base/blocks/
// ImageWithText/ImageWithText.classes.ts (эта package используется только
// для /api/themes/bloom/puck-config; рендер — themes/bloom/src/components/
// sections/ImageWithText.astro).
export const ImageWithTextClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4',
  inner: {
    imageLeft:
      'grid grid-cols-1 md:grid-cols-2 items-center gap-[var(--spacing-grid-col-gap)]',
    imageRight:
      'grid grid-cols-1 md:grid-cols-2 items-center gap-[var(--spacing-grid-col-gap)]',
  },
  imageCol: {
    imageLeft: 'md:order-1',
    imageRight: 'md:order-2',
  },
  textCol: {
    imageLeft: 'md:order-2',
    imageRight: 'md:order-1',
  },
  image:
    'w-full aspect-[4/3] object-cover rounded-[var(--radius-media)]',
  heading:
    '[font-family:var(--font-heading)] text-[length:var(--size-section-heading,1.25rem)] font-normal leading-[1.2] text-[rgb(var(--color-heading))] mb-3',
  text: '[font-family:var(--font-body)] text-[16px] font-normal leading-[1.25] text-[rgb(var(--color-text))] mb-6',
  button:
    'inline-flex items-center justify-center h-[48px] px-4 text-[16px] font-normal uppercase no-underline transition-colors [font-family:var(--font-body)] self-start border-[1.3px] border-solid border-[rgb(var(--color-button-border))] rounded-[var(--radius-button)] bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))] hover:bg-[rgb(var(--color-button-bg-hover))] hover:text-[rgb(var(--color-button-text-hover))]',
  ctaPosition: {
    inline: '',
    'bottom-pinned': 'mt-auto',
  },
  textColFlex: {
    inline: '',
    'bottom-pinned': 'flex flex-col h-full',
  },
  textStyle: {
    normal: '',
    italic: 'italic',
  },
  // Пункт [23] — «Контейнер» ВКЛ: surface-бокс на текстовую колонку (канон
  // Nikita, паритет MultiColumns bloom cardSurfaceCls).
  containerSurface:
    'rounded-[var(--radius-card,12px)] bg-[rgb(var(--color-surface,255_255_255))] px-6 py-8',
} as const;

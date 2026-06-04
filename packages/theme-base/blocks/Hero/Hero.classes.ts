export const HeroClasses = {
  root: 'relative w-full overflow-hidden bg-[var(--hero-root-background-color)]',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4',
  inner: {
    // items/justify *не* зашиваем — Позиция (hAlign/vAlign из 9 значений)
    // полностью контролирует горизонтальное и вертикальное выравнивание.
    // Если положение не задано → default vAlign[center]+hAlign[center].
    centered: 'flex flex-col py-12 min-h-[inherit]',
    split: 'grid grid-cols-1 md:grid-cols-2 items-center gap-8 py-12',
    overlay: 'relative min-h-[60vh] flex flex-col py-12',
    'grid-4': 'flex flex-col py-12 gap-8 min-h-[inherit]',
    // 089 bloom pilot — edge-to-edge split (no container max-width, no padding):
    // text column bottom-aligned (justify-end), image column full-height.
    'split-bloom':
      'flex flex-col md:flex-row items-stretch w-full min-h-[560px] md:min-h-[720px]',
  },
  // Horizontal alignment of the inner content block — 9 значений по
  // вертикали × горизонтали из Figma Hero sidebar.
  hAlign: {
    'top-left': 'items-start text-left',
    'top-center': 'items-center text-center',
    'top-right': 'items-end text-right',
    'center-left': 'items-start text-left',
    center: 'items-center text-center',
    'center-right': 'items-end text-right',
    'bottom-left': 'items-start text-left',
    'bottom-center': 'items-center text-center',
    'bottom-right': 'items-end text-right',
  },
  // Vertical alignment inside overlay variant (full-height stage).
  vAlign: {
    'top-left': 'justify-start',
    'top-center': 'justify-start',
    'top-right': 'justify-start',
    'center-left': 'justify-center',
    center: 'justify-center',
    'center-right': 'justify-center',
    'bottom-left': 'justify-end',
    'bottom-center': 'justify-end',
    'bottom-right': 'justify-end',
  },
  // 091 — размер заголовка/текста управляется через CSS-var на root section:
  // --hero-heading-size / --hero-text-size. Constructor шлёт значения через
  // heading.size / text.size, Hero.astro вычисляет calc(...) и инжектит в
  // style на root. Здесь base просто читает var с fallback'ом.
  title:
    '[font-family:var(--font-heading)] [font-weight:var(--weight-heading)] [text-transform:var(--text-transform-heading)] text-[var(--hero-title-font-size)] leading-tight text-[rgb(var(--color-heading))]',
  subtitle:
    'mt-2 [font-family:var(--font-body)] text-[var(--hero-subtitle-font-size)] text-[rgb(var(--color-text))] px-[var(--hero-subtitle-padding-x)] sm:text-[var(--hero-subtitle-font-size-sm)] md:text-[var(--hero-subtitle-font-size-md)] lg:text-[var(--hero-subtitle-font-size-lg)]',
  ctaButton:
    // Hero CTA = primary button: high-contrast action. Secondary was used
    // before, but schemes like Inverse (secondaryButton: transparent bg +
    // white text) turn the CTA invisible on light hero backdrops, which
    // diverged from the constructor's React render (primary). Primary keeps
    // site ≡ constructor parity without relying on merchant filling both
    // button slots with compatible colors.
    'inline-flex items-center justify-center h-[var(--hero-cta-button-height)] rounded-[var(--hero-cta-button-border-radius)] px-[var(--hero-cta-button-padding-x)] text-[var(--hero-cta-button-font-size)] [font-family:var(--font-body)] border border-[rgb(var(--color-button-border))] bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))] hover:bg-[rgb(var(--color-button-bg-hover))] hover:text-[rgb(var(--color-button-text-hover))] transition-colors no-underline min-h-[var(--hero-cta-button-min-height)] min-w-[var(--hero-cta-button-min-width)] hover:opacity-[var(--hero-cta-button-opacity-hover)] sm:h-[var(--hero-cta-button-height-sm)] sm:min-h-[var(--hero-cta-button-min-height-sm)] sm:min-w-[var(--hero-cta-button-min-width-sm)] sm:rounded-[var(--hero-cta-button-border-radius-sm)] sm:px-[var(--hero-cta-button-padding-x-sm)] sm:py-[var(--hero-cta-button-padding-y-sm)] sm:text-[var(--hero-cta-button-font-size-sm)] md:text-[var(--hero-cta-button-font-size-md)]',
  image: {
    centered: 'absolute inset-0 -z-10 object-cover w-full h-full',
    split: 'w-full aspect-[4/3] object-cover',
    overlay: 'absolute inset-0 -z-10 object-cover w-full h-full opacity-60',
    'grid-4': 'w-full aspect-square object-cover rounded-[var(--radius-media)]',
    // 089 bloom pilot — edge-to-edge image fills the right column.
    'split-bloom': 'absolute inset-0 object-cover w-full h-full',
  },
  // 089 bloom pilot — split-bloom column classes
  splitBloomTextCol:
    'flex-1 min-w-0 flex flex-col justify-end gap-[24px] bg-[rgb(var(--color-bg))] px-6 md:px-[80px] lg:px-[120px] py-[60px] md:py-[100px] lg:py-[120px]',
  splitBloomImageCol: 'flex-1 min-w-0 relative min-h-[320px] md:min-h-full',
  // Kicker = small uppercase accent-color heading (Bloom signature).
  splitBloomKicker:
    '[font-family:var(--font-heading)] text-[20px] leading-[1.3] tracking-[0.08em] uppercase text-[rgb(var(--color-accent))]',
  splitBloomSubtitle:
    '[font-family:var(--font-body)] text-[14px] md:text-[16px] leading-[1.6] text-[rgb(var(--color-text))]',
  splitBloomCta:
    'inline-flex items-center justify-center self-start h-[var(--size-hero-button-h)] rounded-[var(--radius-button)] px-8 text-[14px] md:text-[15px] tracking-[0.04em] [font-family:var(--font-body)] border border-[rgb(var(--color-button-border))] bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))] hover:bg-[rgb(var(--color-button-bg-hover))] hover:text-[rgb(var(--color-button-text-hover))] transition-colors no-underline',
  gridContainer:
    'w-full max-w-[var(--container-max-width)] grid grid-cols-2 gap-4 md:gap-6 lg:gap-8',
  gridTile:
    'relative overflow-hidden rounded-[var(--radius-media)] bg-[rgb(var(--color-surface))] aspect-square',
  // 084 vanilla pilot — carousel mode classes
  carouselRoot: 'relative w-full',
  slide: 'relative h-[var(--slide-min-height,60vh)] flex items-center justify-center',
  slideHidden: 'hidden',
  imageFullBleed: '!left-1/2 -translate-x-1/2 w-screen !max-w-none',
  pagination: 'flex justify-center items-center gap-5 mt-6 pb-6',
  paginationButton:
    '[font-family:var(--font-pagination,Exo_2,sans-serif)] font-light text-[16px] text-[rgb(var(--color-text)/0.6)]',
  paginationButtonActive: 'text-[rgb(var(--color-heading))]',
  carouselArrow:
    'w-6 h-6 inline-flex items-center justify-center text-[rgb(var(--color-heading))]',
  // Vanilla solid CTA — pre-existing buttonStyle classes already in HeroClasses
  // if not present, mirror MainText.buttonStyle
  buttonStyleSolid: '',
  buttonStyleOutlined: '!bg-transparent border-[1.3px] border-[rgb(var(--color-button-text))] uppercase',
} as const;

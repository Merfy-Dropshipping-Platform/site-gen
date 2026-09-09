export const SlideshowClasses = {
  root: 'relative w-full overflow-hidden',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4',
  containerFullscreen: 'w-full',
  frame: 'relative overflow-hidden',
  frameContained: 'rounded-[var(--radius-media)]',
  /**
   * 084 vanilla pilot — base slide flex container WITHOUT hardcoded
   * cross-axis (items-*) or text alignment. Alignment is composed via
   * `contentAlign` (vertical / cross-axis) + `align` (text-align) maps
   * so callers never end up with conflicting `items-center items-start`
   * or `text-center text-left` pairs.
   */
  slide: 'relative isolate flex flex-col',
  size: {
    small: 'min-h-[min(50svh,460px)]',
    medium: 'min-h-[min(75svh,680px)]',
    large: 'min-h-[min(100svh,900px)]',
  },
  position: {
    'top-left': 'justify-start items-start',
    'top-center': 'justify-start items-center',
    'top-right': 'justify-start items-end',
    'center-left': 'justify-center items-start',
    center: 'justify-center items-center',
    'center-right': 'justify-center items-end',
    'bottom-left': 'justify-end items-start',
    'bottom-center': 'justify-end items-center',
    'bottom-right': 'justify-end items-end',
  },
  /**
   * 084 vanilla pilot — additive `contentAlign` variant. Default
   * (`center`) preserves pre-084 vertical centering. `left` shifts
   * content to the start of the cross-axis (top of the slide column).
   */
  contentAlign: {
    center: 'items-center',
    left: 'items-start',
  },
  image: 'absolute inset-0 -z-10 object-cover w-full h-full',
  overlay: 'pointer-events-none absolute inset-0 -z-[5] bg-black',
  /**
   * 084 vanilla pilot — additive `imageFullBleed` variant. When enabled,
   * background image breaks out of the parent container and spans full
   * viewport width (100vw). Used for vanilla hero (1920×880) where
   * Figma reference has section image edge-to-edge while content stays
   * inside max-width container. Default (rose/satin/bloom/flux) preserved.
   */
  imageFullBleed: '!left-1/2 -translate-x-1/2 w-screen !max-w-none',
  /**
   * 084 vanilla pilot — content column WITHOUT hardcoded `text-center`.
   * Text alignment is applied via the `align` map below so callers
   * don't end up with conflicting `text-center text-left` pairs.
   */
  content: 'relative z-10 flex max-w-[min(100%,640px)] flex-col gap-4 p-8',
  contentBox:
    'rounded-[var(--radius-card)] bg-[rgb(var(--color-bg)/0.95)] shadow-sm',
  /**
   * Text-align variants applied to the slide row + content column.
   */
  align: {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  },
  contentItems: {
    left: 'items-start',
    center: 'items-center',
    right: 'items-end',
  },
  heading:
    '[font-family:var(--font-heading)] leading-tight text-[rgb(var(--color-heading))]',
  headingSize: {
    small: 'text-2xl md:text-3xl',
    medium: 'text-3xl md:text-5xl',
    large: 'text-4xl md:text-6xl',
  },
  /**
   * 084 vanilla pilot — Arsenal italic 16px subtitle, themed via
   * `--color-text`. No hex literals; opacity preserved for legibility
   * over hero imagery.
   */
  subtitle:
    '[font-family:var(--font-body)] italic leading-[1.25] mt-1 text-[rgb(var(--color-text))] opacity-90',
  textSize: {
    small: 'text-sm',
    medium: 'text-base md:text-lg',
    large: 'text-lg md:text-2xl',
  },
  pagination: 'flex justify-center gap-2 mt-4',
  paginationButton: 'transition-opacity',
  paginationDots: 'w-2 h-2 rounded-full bg-current',
  paginationLines: 'w-8 h-1 bg-current',
  paginationNumbers: 'min-w-[24px] h-6 px-2 text-xs',
  paginationCounter: 'min-w-[48px] h-6 px-2 text-xs text-center',
  paginationActive: 'opacity-100',
  paginationInactive: 'opacity-40',
  ctaButton:
    'inline-flex items-center justify-center h-[var(--size-hero-button-h)] rounded-[var(--radius-button)] px-8 mt-8 border border-[rgb(var(--color-button-border))] bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))] hover:bg-[rgb(var(--color-button-bg-hover))] hover:text-[rgb(var(--color-button-text-hover))] transition-colors no-underline',
  /**
   * 084 vanilla pilot — additive `buttonStyle` variant for hero CTA.
   * `solid` adds nothing (pre-084 behaviour preserved). `outlined`
   * overrides the solid background to transparent and uses a 1.3px
   * current-color border with uppercase text — matches Vanilla scheme-1
   * Figma reference (transparent fill + white border on dark hero).
   */
  buttonStyle: {
    solid: '',
    outlined:
      '!bg-transparent border-[1.3px] border-[rgb(var(--color-button-text))] uppercase',
  },
} as const;

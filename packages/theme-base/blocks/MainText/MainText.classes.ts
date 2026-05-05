export const MainTextClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4',
  heading:
    '[font-family:var(--font-heading)] font-normal leading-[1.2] text-[rgb(var(--color-heading))] mb-3',
  headingSize: {
    small: 'text-[length:var(--size-section-heading,1.25rem)]',
    medium: 'text-[28px] sm:text-[32px] md:text-[36px]',
    large: 'text-[32px] sm:text-[40px] md:text-[48px] italic',
  },
  text: '[font-family:var(--font-body)] text-[16px] font-normal leading-[1.25] text-[rgb(var(--color-text))]',
  align: {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  },
  ctaWrap: 'mt-6 flex',
  ctaWrapAlign: {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end',
  },
  /**
   * 084 vanilla pilot — additive `buttonStyle` variant. `solid` adds no
   * extra classes (pre-084 behaviour preserved). `outlined` overrides the
   * background to transparent and uses 1.3px current-color border.
   */
  buttonStyle: {
    solid: '',
    outlined:
      '!bg-transparent border-[1.3px] border-current text-[rgb(var(--color-button-text))]',
  },
  /**
   * 084 vanilla pilot Stage 2 Task 6 — additive `textStyle` variant.
   * `normal` (default) preserves pre-084 styling. `italic` applies italic
   * to the heading + body pair (vanilla home «Тепло вашего дома…»).
   */
  textStyle: {
    normal: '',
    italic: 'italic',
  },
  cta: {
    primary:
      '[font-family:var(--font-body)] inline-flex h-14 items-center justify-center rounded-[var(--radius-button)] px-6 text-[14px] font-medium uppercase tracking-wide transition-opacity hover:opacity-90 bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))] border border-[rgb(var(--color-button-border))]',
    black:
      '[font-family:var(--font-body)] inline-flex h-14 items-center justify-center rounded-[var(--radius-button)] px-6 text-[14px] font-medium uppercase tracking-wide transition-opacity hover:opacity-90 bg-[#0a0a0a] text-[#ffffff] border border-[#0a0a0a]',
    white:
      '[font-family:var(--font-body)] inline-flex h-14 items-center justify-center rounded-[var(--radius-button)] px-6 text-[14px] font-medium uppercase tracking-wide transition-opacity hover:opacity-90 bg-[#ffffff] text-[#0a0a0a] border border-[#e5e5e5]',
  },
} as const;

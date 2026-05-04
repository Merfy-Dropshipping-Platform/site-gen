export const SlideshowClasses = {
  root: 'relative w-full overflow-hidden',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4',
  /**
   * 084 vanilla pilot — base slide flex container WITHOUT hardcoded
   * cross-axis (items-*) or text alignment. Alignment is composed via
   * `contentAlign` (vertical / cross-axis) + `align` (text-align) maps
   * so callers never end up with conflicting `items-center items-start`
   * or `text-center text-left` pairs.
   */
  slide: 'relative min-h-[var(--slide-min-height,60vh)] flex justify-center',
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
  /**
   * 084 vanilla pilot — content column WITHOUT hardcoded `text-center`.
   * Text alignment is applied via the `align` map below so callers
   * don't end up with conflicting `text-center text-left` pairs.
   */
  content: 'relative z-10',
  /**
   * Text-align variants applied to the slide row + content column.
   */
  align: {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  },
  heading:
    '[font-family:var(--font-heading)] text-[length:var(--size-hero-heading)] leading-tight text-[rgb(var(--color-heading))]',
  /**
   * 084 vanilla pilot — Arsenal italic 16px subtitle, themed via
   * `--color-text`. No hex literals; opacity preserved for legibility
   * over hero imagery.
   */
  subtitle:
    '[font-family:var(--font-body)] italic text-[16px] leading-[1.25] mt-1 text-[rgb(var(--color-text))] opacity-90',
  ctaButton:
    'inline-flex items-center justify-center h-[var(--size-hero-button-h)] rounded-[var(--radius-button)] px-8 mt-8 border border-[rgb(var(--color-button-border))] bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))]',
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

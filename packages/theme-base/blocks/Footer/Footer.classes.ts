export const FooterClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4',
  newsletter: {
    wrapper: 'pb-10 sm:pb-12 md:pb-16 lg:pb-20 xl:pb-24',
    inner: 'max-w-full sm:max-w-2xl md:max-w-3xl lg:max-w-4xl xl:max-w-[809px] mx-auto',
    copy: 'flex flex-col items-center gap-3 sm:gap-4 lg:gap-[5px] mb-8 sm:mb-10 lg:mb-12',
    heading: '[font-family:var(--font-heading)] font-normal uppercase leading-[1.115] text-[rgb(var(--color-heading))] text-center',
    description: '[font-family:var(--font-body)] font-normal leading-[1.366] text-[rgb(var(--color-text))] opacity-70 px-4 sm:px-0 text-center',
    form: 'w-full max-w-full sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-[600px] mx-auto h-auto sm:h-16 md:h-[70px] lg:h-[75px] xl:h-[80px] flex flex-col sm:flex-row justify-between items-stretch sm:items-center px-4 sm:px-5 lg:px-[25px] py-3 sm:py-2 lg:py-[10px] gap-3 sm:gap-2 lg:gap-[10px] border border-[rgb(var(--color-muted))] rounded-[var(--radius-input)]',
    input: 'flex-1 bg-transparent text-lg sm:text-xl md:text-[22px] lg:text-2xl [font-family:var(--font-body)] font-light leading-[1.366] outline-none text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))]',
    submit: 'w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center self-end sm:self-center text-[rgb(var(--color-text))] hover:scale-110 transition-transform',
  },
  main: {
    section: 'pb-6 sm:pb-8 md:pb-10 lg:pb-12 xl:pb-16',
    twoPart: 'flex flex-wrap items-start justify-between gap-8',
    leftGroup: 'flex flex-wrap items-center gap-6 md:gap-8',
    leftTitle: '[font-family:var(--font-heading)] font-normal uppercase leading-[1.115] text-[rgb(var(--color-heading))] text-xl',
    leftNav: 'flex flex-wrap flex-row items-center gap-4 md:gap-6',
    leftLink: '[font-family:var(--font-body)] text-[length:var(--size-nav-link)] font-normal leading-[1.366] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))] transition-colors',
    rightGroup: 'flex flex-wrap items-center gap-6',
    rightEmail: '[font-family:var(--font-body)] text-[length:var(--size-nav-link)] font-normal leading-[1.366] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))] transition-colors',
    socialRow: 'flex items-center gap-3',
    socialLink: 'w-8 h-8 flex items-center justify-center text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))] transition-colors',
  },
  copyright: {
    bar: 'w-full flex items-center justify-center h-16 bg-[rgb(var(--color-heading))] text-[rgb(var(--color-bg))]',
    text: '[font-family:var(--font-body)] font-light leading-[1.21] text-center px-4 sm:px-6',
  },
  /**
   * 084 vanilla pilot — additive `variant` value `'2-part-asymmetric'`.
   * Pre-084 variants (`3-col`/`2-part`/`minimal`) keep their existing
   * markup and styles. Asymmetric splits the footer into a left-aligned
   * column (items-start) and a right-stretched column (items-end +
   * self-stretch + h-full) for the vanilla parity.
   */
  variant: {
    '2-part-asymmetric': {
      row: 'flex justify-between',
      left: 'flex flex-col gap-6 items-start',
      right: 'flex flex-col gap-16 items-end self-stretch h-full',
    },
  },
  /**
   * 084 vanilla pilot — additive `bottomStrip` markup. Black bar with
   * "Powered by Merfy" text rendered beneath the main footer. Theme
   * controls colours via `--color-bottom-strip-bg`/`-text` and the font
   * via `--font-powered-by`.
   */
  bottomStrip: {
    wrapper:
      'w-full bg-[rgb(var(--color-bottom-strip-bg,0_0_0))] text-[rgb(var(--color-bottom-strip-text,255_255_255))] py-5 text-center',
    text: '[font-family:var(--font-powered-by,inherit)] text-[12px] leading-[15px]',
  },
} as const;

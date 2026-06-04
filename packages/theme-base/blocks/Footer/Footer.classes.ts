/**
 * Footer.classes — shared across themes. Variants:
 *  - `3-col` — Newsletter top + 3 columns (nav / info / social right) + black bottom bar (Figma 905-19155, flux canonical)
 *  - `2-part` — left brand+nav / right contacts+socials + copyBar + poweredBy bar (legacy, bloom)
 *  - `2-part-asymmetric` — left items-start / right items-end self-stretch (vanilla)
 *  - `minimal` — left brand+nav / right email+socials + secondary row (info links) + copyright bar
 *
 * Colors flow via CSS-vars (--color-bg / --color-heading / --color-text / --color-muted), so
 * each theme paints the same structure with its palette. Sizes use Tailwind responsive scales.
 */
export const FooterClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container: 'mx-auto max-w-[var(--footer-container-max-width)] px-4 sm:px-[var(--footer-container-padding-x-sm)] md:px-[var(--footer-container-padding-x-md)] lg:px-[var(--footer-container-padding-x-lg)] xl:px-[var(--footer-container-padding-x-xl)] w-[var(--footer-container-width)] pb-[var(--footer-container-padding-bottom)] pt-[var(--footer-container-padding-top)] 2xl:px-[var(--footer-container-padding-x-2xl)]',
  newsletter: {
    wrapper: 'pb-10 sm:pb-12 md:pb-16 lg:pb-[40px] w-[var(--footer-newsletter-wrapper-width)] gap-[var(--footer-newsletter-wrapper-gap)]',
    inner: 'w-full',
    copy: 'flex flex-col gap-2 max-w-[var(--footer-newsletter-copy-max-width)]',
    heading: '[font-family:var(--font-heading)] font-normal uppercase leading-[1.115] text-[rgb(var(--color-heading))] text-[20px] w-[var(--footer-newsletter-heading-width)]',
    description: '[font-family:var(--font-body)] font-light leading-[1.4] text-[16px] text-[rgb(var(--color-muted))]',
    form: 'w-full max-w-[var(--footer-newsletter-form-max-width)] mt-6 h-[var(--footer-newsletter-form-height)] flex items-center justify-between px-4 rounded-[var(--footer-newsletter-form-border-radius)] border border-[rgb(var(--color-muted))]/30 bg-[rgb(var(--color-bg))] gap-[var(--footer-newsletter-form-gap)] border-[var(--footer-newsletter-form-border-color)] pl-[var(--footer-newsletter-form-padding-left)] pr-[var(--footer-newsletter-form-padding-right)] focus-within:border-[var(--footer-newsletter-form-border-color-focus-within)]',
    input: 'flex-1 bg-transparent text-[var(--footer-newsletter-input-font-size)] [font-family:var(--font-body)] font-light leading-[1.4] outline-none text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))]',
    submit: 'w-8 h-8 flex items-center justify-center text-[rgb(var(--color-text))] hover:scale-110 transition-transform text-[var(--footer-newsletter-submit-font-size)] active:[transform:var(--footer-newsletter-submit-transform-active)]',
  },
  main: {
    section: 'pb-6 sm:pb-8 md:pb-10 lg:pb-12 xl:pb-16 w-[var(--footer-main-section-width)] gap-[var(--footer-main-section-gap)]',
    // 3-col grid (Figma 905-19155): 3 equal-ish columns, last aligned right
    grid: 'flex flex-col md:flex-row md:items-start md:justify-between gap-[var(--footer-main-grid-gap)] md:gap-12 lg:gap-16 sm:gap-[var(--footer-main-grid-gap-sm)]',
    socialColumnWrap: 'flex flex-col items-end max-w-[318px] md:self-stretch text-right',
    // minimal variant fallback (kept for bloom-like usage)
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
  // Per-column structure (used by 3-col variant — title + body or nav)
  column: {
    root: 'flex flex-col gap-[var(--footer-column-root-gap)] flex-1 min-w-0 max-w-[318px]',
    title: '[font-family:var(--font-heading)] font-normal uppercase leading-[1.2] text-[16px] text-[rgb(var(--color-heading))]',
    body: 'flex flex-col gap-3',
    nav: 'flex flex-col gap-3',
  },
  link: '[font-family:var(--font-body)] font-light leading-[1.4] text-[16px] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))] transition-colors',
  email: '[font-family:var(--font-body)] font-light leading-[1.4] text-[16px] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))] transition-colors',
  socialRow: 'flex gap-4 items-center justify-end',
  socialLink: 'w-6 h-6 flex items-center justify-center text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))] transition-colors',
  copyright: {
    // Figma 905-19155: full-width black bar, h-100, centered text 20px light white
    bar: 'w-full h-[var(--footer-copyright-bar-height)] sm:h-20 md:h-24 lg:h-[100px] flex items-center justify-center py-6 sm:py-0 bg-[rgb(var(--color-heading))] text-[rgb(var(--color-bg))] px-[var(--footer-copyright-bar-padding-x)]',
    text: '[font-family:var(--font-body)] font-light leading-[1.21] text-[var(--footer-copyright-text-color)] text-center px-4 sm:px-6',
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

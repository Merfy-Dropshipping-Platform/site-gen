export const PromoBannerClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container:
    'mx-auto max-w-[var(--container-max-width)] px-4 flex items-center justify-center gap-1 text-center text-[13px] uppercase tracking-[0.08em]',
  text: '[font-family:var(--font-body)] font-[var(--weight-body)] text-[rgb(var(--color-text))]',
  link: '[font-family:var(--font-body)] underline underline-offset-2 text-[rgb(var(--color-text))] hover:opacity-70',
  /**
   * 084 vanilla pilot — additive value `thin` for the existing size axis.
   * Pre-084 values (small/medium/large) reproduce identical rendering.
   * `thin` exposes a token-driven height so themes can pin the banner
   * to a specific px (vanilla = 56px via `--promo-banner-h-thin`).
   */
  size: {
    thin: 'h-[var(--promo-banner-h-thin,56px)] text-[12px] py-0',
    small: 'text-xs py-2',
    medium: 'text-sm py-3',
    large: 'text-base py-4',
  },
  /**
   * 084 vanilla pilot — additive `textTransform` variant. `none`
   * preserves pre-084 banner casing as authored. `uppercase` adds the
   * Tailwind `uppercase` utility on top.
   */
  textTransform: {
    none: 'normal-case',
    uppercase: 'uppercase',
  },
} as const;

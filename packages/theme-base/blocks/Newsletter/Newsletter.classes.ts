// Newsletter block — compact design matching Figma Rose reference (frame
// 947:11507). Heading is small uppercase (not hero-size), description is
// lighter grey, form is a single line input with a border-bottom style and
// an icon-arrow submit button floated right — no separate "Подписаться"
// button. Matches the footer-embedded newsletter exactly so merchants
// see visual consistency when both are on the page.
export const NewsletterClasses = {
  root:
    'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container:
    'mx-auto max-w-[var(--container-max-width)] px-4 text-left',
  inner:
    'mx-auto max-w-[var(--size-newsletter-form-w,420px)]',
  heading:
    '[font-family:var(--font-heading)] text-[14px] leading-[16px] tracking-[0.05em] uppercase text-[rgb(var(--color-heading))] mb-2',
  description:
    '[font-family:var(--font-body)] text-[12px] leading-[15px] text-[rgb(var(--color-text))]/60 mb-5',
  form:
    'relative flex items-center w-full border-b border-[rgb(var(--color-text))]/30',
  input:
    'flex-1 h-10 bg-transparent border-0 outline-none pr-10 text-[14px] [font-family:var(--font-body)] text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-text))]/40',
  button:
    'absolute right-0 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-[rgb(var(--color-heading))] hover:opacity-70 transition-opacity',
  /**
   * 084 vanilla pilot — additive `formLayout` variant.
   *   - `inline-submit` (vanilla parity): full bordered input, height 56px,
   *     submit button rendered INSIDE on the right (h=32, white solid).
   *   - `stacked`: button below input as block element.
   *   Both variants stay token-driven — colours come from the active scheme.
   */
  formWrapper: {
    'inline-submit':
      'relative flex items-center justify-between w-full max-w-[652px] h-14 pl-4 pr-3 border border-[rgb(var(--color-text))]',
    stacked: 'flex flex-col items-stretch gap-3 w-full',
  },
  /**
   * Inline-submit button — small white solid pill INSIDE the bordered
   * input on the right. Uses scheme-aware tokens so the button stays
   * legible in any colour scheme.
   */
  buttonInline:
    'inline-flex items-center justify-center h-8 px-2 [font-family:var(--font-body)] text-[12px] uppercase bg-[rgb(var(--color-bg))] text-[rgb(var(--color-heading))] hover:opacity-80 transition-opacity',
  buttonStacked:
    'inline-flex items-center justify-center h-12 px-6 rounded-[var(--radius-button)] [font-family:var(--font-body)] text-[14px] font-medium uppercase tracking-wide bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))] border border-[rgb(var(--color-button-border))] hover:opacity-90 transition-opacity',
} as const;

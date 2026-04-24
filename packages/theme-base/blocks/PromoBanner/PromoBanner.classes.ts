export const PromoBannerClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container:
    'mx-auto max-w-[var(--container-max-width)] px-4 flex items-center justify-center gap-1 text-center text-[13px] uppercase tracking-[0.08em]',
  text: '[font-family:var(--font-body)] font-[var(--weight-body)] text-[rgb(var(--color-text))]',
  link: '[font-family:var(--font-body)] underline underline-offset-2 text-[rgb(var(--color-text))] hover:opacity-70',
} as const;

export const PromoBannerClasses = {
  root: 'relative w-full',
  container:
    'mx-auto max-w-[var(--container-max-width)] px-4 flex items-center justify-center gap-4 text-center',
  text: 'font-[var(--font-body)] font-[var(--weight-body)] text-[rgb(var(--color-text))]',
  link: 'font-[var(--font-body)] underline text-[rgb(var(--color-heading))] hover:opacity-70',
} as const;

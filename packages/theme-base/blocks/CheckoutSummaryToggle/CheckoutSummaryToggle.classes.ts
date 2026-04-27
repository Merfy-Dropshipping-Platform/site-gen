export const CheckoutSummaryToggleClasses = {
  root: 'w-full bg-[rgb(var(--color-bg))] border-y border-[rgb(var(--color-border)/.5)]',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4 flex items-center justify-between',
  header: 'flex items-center gap-2 [font-family:var(--font-body)] text-[length:var(--size-body)] text-[rgb(var(--color-text))]',
  total: '[font-family:var(--font-body)] text-[length:var(--size-body)] text-[rgb(var(--color-text))] font-semibold',
  hideOnDesktop: 'md:hidden',
  hideOnMobile: 'hidden md:block',
} as const;

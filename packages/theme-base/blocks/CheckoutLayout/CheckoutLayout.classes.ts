export const CheckoutLayoutClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))]',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4',
  grid: 'grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8',
  form: 'bg-[rgb(var(--color-bg))] p-6 rounded-[var(--radius-card)]',
  summary: 'bg-[rgb(var(--color-surface))] p-6 rounded-[var(--radius-card)] h-fit',
  summaryHeading: 'font-[var(--font-heading)] text-[length:var(--size-hero-heading)] text-[rgb(var(--color-heading))] mb-4',
  trustBadges: 'mt-[var(--spacing-section-y)] flex flex-wrap items-center justify-center gap-4 font-[var(--font-body)] text-[rgb(var(--color-text))]',
} as const;

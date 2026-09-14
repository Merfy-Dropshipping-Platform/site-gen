export const AccountSectionClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4 py-20',
  heading:
    '[font-family:var(--font-heading)] text-[length:var(--size-hero-heading)] text-[rgb(var(--color-heading))] mb-8',
  muted:
    '[font-family:var(--font-body)] text-[rgb(var(--color-text))] opacity-70',
} as const;

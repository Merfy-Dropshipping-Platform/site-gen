export const AccountLayoutClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))]',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4',
  greeting: 'mb-[var(--spacing-section-y)]',
  heading: '[font-family:var(--font-heading)] text-[length:var(--size-hero-heading)] text-[rgb(var(--color-heading))]',
  sidebar: {
    left: 'lg:grid-cols-[260px_1fr]',
    right: 'lg:grid-cols-[1fr_260px]',
  },
  grid: 'grid grid-cols-1 gap-6',
  navPanel: 'bg-[rgb(var(--color-surface))] rounded-[var(--radius-card)] p-4',
  nav: 'flex flex-col gap-1',
  navLink: 'px-3 py-2 rounded-[var(--radius-card)] [font-family:var(--font-body)] text-[length:var(--size-nav-link)] text-[rgb(var(--color-text))] no-underline data-[active=true]:text-[rgb(var(--color-primary))] data-[active=true]:bg-[rgb(var(--color-bg))]',
  logoutBtn: 'mt-2 px-3 py-2 rounded-[var(--radius-card)] [font-family:var(--font-body)] text-[length:var(--size-nav-link)] text-[rgb(var(--color-error))] bg-transparent border-0 cursor-pointer text-left',
  content: 'bg-[rgb(var(--color-surface))] rounded-[var(--radius-card)] p-6',
} as const;

export const HeaderClasses = {
  root: 'relative w-full z-40 bg-[rgb(var(--color-bg))]',
  sticky: {
    'scroll-up': 'sticky top-0',
    always: 'sticky top-0',
    none: 'relative',
  },
  container: 'mx-auto max-w-[var(--container-max-width)] px-4 flex items-center',
  logoBox: {
    'top-left': 'justify-start',
    'top-center': 'justify-center',
    'top-right': 'justify-end',
    'center-left': 'justify-start',
  },
  logo: 'max-w-[var(--size-logo-width)] h-auto [font-family:var(--font-heading)] text-xl text-[rgb(var(--color-heading))]',
  nav: 'flex items-center gap-6',
  navLink: '[font-family:var(--font-body)] text-[length:var(--size-nav-link)] text-[rgb(var(--color-text))] hover:text-[rgb(var(--color-primary))]',
  actions: 'ml-auto flex items-center gap-4',
  actionButton: 'p-2 text-[rgb(var(--color-text))] hover:text-[rgb(var(--color-primary))] transition-colors',
} as const;

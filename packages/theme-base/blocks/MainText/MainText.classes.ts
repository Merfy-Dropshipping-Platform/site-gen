export const MainTextClasses = {
  root: 'relative w-full',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4',
  heading:
    'font-[var(--font-heading)] text-[var(--size-hero-heading)] text-[rgb(var(--color-heading))] leading-tight mb-6',
  text: 'font-[var(--font-body)] text-[rgb(var(--color-text))] leading-relaxed',
  align: {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  },
} as const;

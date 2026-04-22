export const MainTextClasses = {
  root: 'relative w-full',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4',
  heading:
    '[font-family:var(--font-heading)] text-[20px] font-normal uppercase tracking-[0.05em] leading-[1.2] text-[rgb(var(--color-heading))] mb-3',
  text: '[font-family:var(--font-body)] text-[16px] font-normal leading-[1.25] text-[rgb(var(--color-text))]',
  align: {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  },
} as const;

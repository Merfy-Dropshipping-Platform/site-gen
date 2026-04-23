export const MainTextClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4',
  heading:
    '[font-family:var(--font-heading)] text-[length:var(--size-section-heading,1.25rem)] font-normal leading-[1.2] text-[rgb(var(--color-heading))] mb-3',
  text: '[font-family:var(--font-body)] text-[16px] font-normal leading-[1.25] text-[rgb(var(--color-text))]',
  align: {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  },
} as const;

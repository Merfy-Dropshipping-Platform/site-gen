export const PageClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4',
  placeholder:
    'w-full min-h-[200px] flex items-center justify-center rounded-[var(--radius-card,8px)] border border-[rgb(var(--color-text))]/10 bg-[rgb(var(--color-surface,var(--color-text)/0.03))]',
  text:
    'text-[length:var(--size-body,16px)] [font-family:var(--font-body)] text-[rgb(var(--color-muted))]',
} as const;

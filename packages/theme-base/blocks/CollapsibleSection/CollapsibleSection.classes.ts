export const CollapsibleSectionClasses = {
  root: 'relative w-full',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4',
  heading:
    'font-[var(--font-heading)] text-[var(--size-hero-heading)] text-[rgb(var(--color-heading))] mb-8 text-center',
  list: 'flex flex-col gap-y-3',
  item:
    'rounded-[var(--radius-field)] border border-[rgb(var(--color-text))]/10 bg-[rgb(var(--color-surface))] overflow-hidden',
  summary:
    'cursor-pointer list-none font-[var(--font-heading)] text-lg text-[rgb(var(--color-heading))] px-6 py-4 flex items-center justify-between',
  content:
    'font-[var(--font-body)] text-base text-[rgb(var(--color-text))] leading-relaxed px-6 pb-4',
} as const;

export const CheckoutLayoutClasses = {
  // Full-page CSS grid — left empty space (pad), form column, gap, summary column.
  // Summary column extends to viewport right edge (full-bleed light grey panel).
  // Mobile (<768px): collapses to single column with px-4 page padding.
  root: 'relative w-full bg-[rgb(var(--color-bg))]',
  grid:
    'grid grid-cols-1 px-4 md:px-0 md:grid-cols-[minmax(420px,2fr)_minmax(320px,1fr)] md:gap-[var(--checkout-gap)] md:max-w-[1280px] md:mx-auto md:px-[var(--checkout-side-pad)]',
  gridSummaryBottom: 'grid grid-cols-1 px-4 max-w-[var(--container-max-width)] mx-auto',
  // Left column: form sections stacked with 40px gap (Figma).
  formColumn: 'flex flex-col gap-10 min-w-0 md:pt-16',
  // Right column: grey panel — inside padding scales with viewport.
  summaryColumn: 'flex flex-col gap-12 min-w-0 bg-[rgb(var(--color-surface))] md:px-12 md:py-16 mt-6 md:mt-0',
} as const;

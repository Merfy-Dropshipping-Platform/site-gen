export const CheckoutLayoutClasses = {
  // Full-page CSS grid — left empty space (pad), form column, gap, summary column.
  // Summary column extends to viewport right edge (full-bleed light grey panel).
  // Mobile (<768px): collapses to single column with px-4 page padding.
  root: 'relative w-full bg-[rgb(var(--color-bg))]',
  grid:
    'grid grid-cols-1 px-4 md:px-0 md:grid-cols-[1fr_var(--checkout-form-col-w)_var(--checkout-gap)_var(--checkout-summary-col-w)] md:max-w-[calc(2*var(--checkout-side-pad)+var(--checkout-form-col-w)+var(--checkout-gap)+var(--checkout-summary-col-w))] md:mx-auto',
  gridSummaryBottom: 'grid grid-cols-1 px-4 max-w-[var(--container-max-width)] mx-auto',
  // Left column: in row 1 col 2 on desktop. Form sections stacked with 40px gap (Figma).
  formColumn: 'flex flex-col gap-10 min-w-0 md:col-start-2 md:col-end-3 md:pt-16',
  // Right column: full-bleed grey panel — col 4 → right edge. Inside padding 64px (Figma 1:13402 inner padding).
  summaryColumn: 'flex flex-col gap-12 min-w-0 bg-[rgb(var(--color-surface))] md:col-start-4 md:col-end-[-1] md:px-16 md:py-16 mt-6 md:mt-0',
} as const;

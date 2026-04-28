export const CheckoutLayoutClasses = {
  // Layout is centered in standard theme container (matches CheckoutHeader and
  // other site pages). Inside the container: 3-col grid form|gap|summary,
  // each shrinking on smaller viewports via minmax. Summary bg fills its
  // column only (no longer full-bleed) — keeps page content aligned with
  // header centerline. Mobile (<768px): single column.
  root: 'relative w-full bg-[rgb(var(--color-bg))]',
  grid:
    'grid grid-cols-1 px-4 mx-auto max-w-[var(--container-max-width)] md:grid-cols-[minmax(420px,var(--checkout-form-col-w))_minmax(40px,var(--checkout-gap))_minmax(360px,var(--checkout-summary-col-w))] md:gap-0 md:px-8',
  gridSummaryBottom:
    'grid grid-cols-1 px-4 mx-auto max-w-[var(--container-max-width)] md:px-8',
  // Form column = grid col 1. Top-pad 64px so form sits below header
  // (header 80h + 64 = 144 per Figma). Mobile keeps pt-10 breathing room.
  formColumn: 'flex flex-col gap-10 min-w-0 pt-10 md:col-start-1 md:col-end-2 md:pt-16',
  // Summary column = grid col 3. Background fills the column (no bleed past
  // container edge — matches centered header). Inner content max 520px per
  // Figma 1:13402, with 64px inset padding on desktop.
  summaryColumn:
    'flex flex-col gap-[50px] min-w-0 bg-[rgb(var(--color-surface))] md:col-start-3 md:col-end-4 md:py-16 mt-6 md:mt-0 [&>*]:max-w-[520px] [&>*]:px-4 md:[&>*]:px-16',
} as const;

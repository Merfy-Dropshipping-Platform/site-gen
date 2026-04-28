export const CheckoutLayoutClasses = {
  // Per Figma 1:13398 (Rose 1920):
  //   [side-pad] [form 652] [gap 84] [summary 884 — full-bleed to viewport right]
  // 5-col grid with 1fr columns absorbing extra on edges, summary spans 4+5
  // so its background extends to right viewport edge naturally on wide screens.
  // Side-pad uses clamp so on 1440px viewport content shifts in, on 1920+ matches Figma.
  // Mobile (<768px): single column.
  root: 'relative w-full bg-[rgb(var(--color-bg))]',
  grid:
    'grid grid-cols-1 px-4 md:px-0 md:grid-cols-[minmax(16px,1fr)_minmax(420px,var(--checkout-form-col-w))_minmax(40px,var(--checkout-gap))_minmax(360px,var(--checkout-summary-col-w))_minmax(0px,1fr)]',
  gridSummaryBottom: 'grid grid-cols-1 px-4 max-w-[var(--container-max-width)] mx-auto',
  // Form column = grid col 2 → col 3 (form area between left-pad and gap).
  // Top-pad 64px so form sits below header (header 80px tall + 64 = 144 per Figma).
  // Apply pt-16 on mobile too — keeps breathing room when sticky toggle bar isn't enough.
  formColumn: 'flex flex-col gap-10 min-w-0 pt-10 md:col-start-2 md:col-end-3 md:pt-16',
  // Summary column = grid col 4 → end (full-bleed). Background fbfbfb extends
  // to viewport right edge automatically via the trailing 1fr column. Inner
  // content max 520px per Figma 1:13402, with 64px inset padding.
  summaryColumn:
    'flex flex-col gap-[50px] min-w-0 bg-[rgb(var(--color-surface))] md:col-start-4 md:col-end-[-1] md:py-16 mt-6 md:mt-0 [&>*]:max-w-[520px] [&>*]:px-4 md:[&>*]:px-16',
} as const;

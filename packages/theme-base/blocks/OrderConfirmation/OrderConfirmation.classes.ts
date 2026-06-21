// Per Figma 1:20479 — двухколоночный thank-you: лево «Оформление заказа»,
// право «Сводка заказа». Цвета через rgb(var(--oc-*)) / rgb(var(--color-*)),
// без hex-литералов. --oc-* эмитятся на корне с fallback (см. .astro).
export const OrderConfirmationClasses = {
  root: 'w-full [font-family:var(--font-body)] [font-weight:var(--weight-body)] text-[rgb(var(--color-text))]',
  container:
    'mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-10 px-4 py-10 md:px-8 lg:grid-cols-[1fr_minmax(340px,560px)] lg:gap-16 lg:py-16',

  // ---------- LEFT: «Оформление заказа» ----------
  orderCol: 'flex min-w-0 flex-col gap-5 rounded-[var(--radius-card)] bg-[rgb(var(--oc-order-bg))]',
  head: 'flex items-start gap-3',
  acceptIcon: 'mt-0.5 shrink-0 text-[rgb(var(--oc-accent))]',
  headText: 'flex flex-col gap-1',
  greeting:
    'text-[length:var(--size-h3)] [font-family:var(--font-heading)] [font-weight:var(--weight-heading)] text-[rgb(var(--color-heading))]',
  orderNumber: 'text-[length:var(--size-small)] text-[rgb(var(--color-muted))]',
  banner: 'w-full overflow-hidden rounded-[var(--radius-media)] bg-[rgb(var(--color-input-bg))]',
  bannerImg: 'block h-[200px] w-full object-cover',
  confirmed: 'flex flex-col gap-1',
  confirmedTitle:
    'text-[length:var(--size-h3)] [font-family:var(--font-heading)] [font-weight:var(--weight-heading)] text-[rgb(var(--color-heading))]',
  confirmedNote: 'text-[length:var(--size-small)] text-[rgb(var(--color-muted))]',
  detailsBox: 'flex flex-col gap-3 rounded-[var(--radius-card)] border border-[rgb(var(--color-border))] p-4',
  detailsTitle:
    'text-[length:var(--size-h3)] [font-family:var(--font-heading)] [font-weight:var(--weight-heading)] text-[rgb(var(--color-heading))]',
  detailRow: 'flex flex-col gap-0.5',
  detailLabel: 'text-[length:var(--size-tiny)] text-[rgb(var(--color-muted))]',
  detailValue: 'text-[length:var(--size-small)] text-[rgb(var(--color-text))]',
  footerRow: 'flex flex-wrap items-center justify-between gap-4 pt-2',
  help: 'text-[length:var(--size-small)] text-[rgb(var(--color-muted))]',
  helpLink: 'text-[rgb(var(--color-text))] underline',
  returnBtn:
    'inline-flex h-[50px] items-center justify-center rounded-[var(--radius-button)] bg-[rgb(var(--oc-button-bg))] px-5 text-[length:var(--size-body)] text-[rgb(var(--color-button-text))]',
  legal: 'pt-2 text-[length:var(--size-tiny)] text-[rgb(var(--color-muted))]',

  // ---------- RIGHT: «Сводка заказа» ----------
  summaryCol: 'flex flex-col gap-6 rounded-[var(--radius-card)] bg-[rgb(var(--oc-summary-bg))] p-5 md:p-8',
  items: 'flex flex-col gap-5',
  conclusion: 'flex flex-col gap-3 border-t border-[rgb(var(--color-border))] pt-4',
  deliveryRow: 'flex items-center justify-between text-[length:var(--size-small)] text-[rgb(var(--color-muted))]',
  totalRow: 'flex items-start justify-between',
  totalLabel:
    'text-[length:var(--size-h3)] [font-family:var(--font-heading)] [font-weight:var(--weight-heading)] text-[rgb(var(--color-heading))]',
  totalValueCol: 'flex flex-col items-end gap-0.5',
  totalValue:
    'text-[length:var(--size-h3)] [font-family:var(--font-heading)] [font-weight:var(--weight-heading)] text-[rgb(var(--color-heading))]',
  totalOld: 'text-[length:var(--size-tiny)] text-[rgb(var(--color-muted))] line-through',

  // ---------- States ----------
  stateBox: 'mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center',
  stateTitle:
    'text-[length:var(--size-h2)] [font-family:var(--font-heading)] [font-weight:var(--weight-heading)] text-[rgb(var(--color-heading))]',
  stateText: 'text-[length:var(--size-small)] text-[rgb(var(--color-muted))]',
  stateError: 'text-[length:var(--size-small)] text-[rgb(var(--oc-error))]',
} as const;

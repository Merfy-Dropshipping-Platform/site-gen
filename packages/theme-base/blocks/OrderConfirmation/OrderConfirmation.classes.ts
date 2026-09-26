// Figma 1:20479 — двухколоночный thank-you: лево «Оформление заказа», право
// «Сводка заказа». Все цвета — из схемы секции: фон/текст/кнопка токенами,
// вторичный текст, рамки и подложка сводки — цветом текста с прозрачностью,
// поэтому читаются в любой схеме (светлой и цветной). Свои цвета мерчанта —
// через --oc-* на корне (см. .astro). Без hex-литералов.
const heading =
  '[font-family:var(--font-heading)] [font-weight:var(--weight-heading)] text-[rgb(var(--color-heading))]';
const muted = 'text-[rgb(var(--color-text)/0.62)]';
const hairline = 'border-[rgb(var(--color-text)/0.12)]';

export const OrderConfirmationClasses = {
  root: 'w-full bg-[rgb(var(--color-bg))] [font-family:var(--font-body)] [font-weight:var(--weight-body)] text-[rgb(var(--color-text))]',
  container:
    'mx-auto grid w-full max-w-[1200px] items-start gap-8 px-4 py-10 md:px-8 md:py-14 lg:grid-cols-[minmax(0,1fr)_minmax(360px,480px)] lg:gap-14 lg:py-20',

  // ---------- LEFT: «Оформление заказа» ----------
  orderCol: 'flex min-w-0 flex-col gap-8 rounded-[var(--radius-card)] bg-[rgb(var(--oc-order-bg)/var(--oc-order-alpha))]',
  orderColFilled: 'p-6 md:p-8',
  head: 'flex items-center gap-4',
  acceptIcon:
    'flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--oc-accent))] text-[rgb(var(--oc-accent-text))]',
  headText: 'flex min-w-0 flex-col gap-1',
  orderNumber: `text-[length:var(--size-small)] uppercase tracking-[0.08em] ${muted}`,
  greeting: `text-[length:var(--size-h2)] leading-tight ${heading}`,
  banner: 'w-full overflow-hidden rounded-[var(--radius-media)] bg-[rgb(var(--color-text)/0.06)]',
  bannerImg: 'block h-[200px] w-full object-cover',
  confirmed: `flex flex-col gap-2 border-l-2 border-[rgb(var(--oc-accent))] pl-4`,
  confirmedTitle: `text-[length:var(--size-h3)] ${heading} [[data-oc-status=failed]_&]:text-[rgb(var(--oc-error))]`,
  confirmedNote: `text-[length:var(--size-small)] leading-relaxed ${muted}`,
  detailsBox: `flex flex-col gap-5 rounded-[var(--radius-card)] border ${hairline} p-5 md:p-6`,
  detailsTitle: `text-[length:var(--size-h3)] ${heading}`,
  detailsGrid: 'grid grid-cols-1 gap-5 sm:grid-cols-2',
  detailRow: 'flex min-w-0 flex-col gap-1',
  detailRowWide: 'flex min-w-0 flex-col gap-1 sm:col-span-2',
  detailLabel: `text-[length:var(--size-tiny)] uppercase tracking-[0.08em] ${muted}`,
  detailValue: 'whitespace-pre-line break-words text-[length:var(--size-body)] leading-snug text-[rgb(var(--color-text))]',
  footerRow: `flex flex-col-reverse gap-4 border-t ${hairline} pt-6 sm:flex-row sm:items-center sm:justify-between`,
  help: `text-[length:var(--size-small)] ${muted}`,
  returnBtn:
    'inline-flex h-[50px] items-center justify-center rounded-[var(--radius-button)] bg-[rgb(var(--oc-button-bg))] px-7 text-[length:var(--size-body)] text-[rgb(var(--oc-button-text))] transition-opacity hover:opacity-85',
  legal: `text-[length:var(--size-tiny)] leading-relaxed text-[rgb(var(--color-text)/0.5)]`,

  // ---------- RIGHT: «Сводка заказа» ----------
  summaryCol:
    'flex flex-col gap-6 rounded-[var(--radius-card)] bg-[rgb(var(--oc-summary-bg)/var(--oc-summary-alpha))] p-6 md:p-8 lg:sticky lg:top-8',
  summaryTitle: `text-[length:var(--size-h3)] ${heading}`,
  items: 'flex flex-col divide-y divide-[rgb(var(--color-text)/0.12)] [&>*]:py-4 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0',
  item: 'flex items-start gap-4',
  itemMedia: 'relative shrink-0',
  itemImg: `h-16 w-16 rounded-[var(--radius-media)] border ${hairline} object-cover md:h-20 md:w-20`,
  itemImgEmpty: `h-16 w-16 rounded-[var(--radius-media)] border ${hairline} bg-[rgb(var(--color-text)/0.06)] md:h-20 md:w-20`,
  itemQty:
    'absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-[rgb(var(--color-heading))] px-1.5 text-[11px] leading-none text-[rgb(var(--color-bg))]',
  itemBody: 'flex min-w-0 flex-1 flex-col gap-1',
  itemName: `text-[length:var(--size-body)] leading-snug ${heading}`,
  itemMeta: `text-[length:var(--size-tiny)] leading-snug ${muted}`,
  itemDescr: `line-clamp-2 text-[length:var(--size-tiny)] leading-snug ${muted}`,
  itemPrice: 'flex shrink-0 flex-col items-end gap-0.5 text-right',
  itemPriceNow: 'text-[length:var(--size-body)] text-[rgb(var(--color-heading))]',
  itemPriceOld: `text-[length:var(--size-tiny)] line-through ${muted}`,
  conclusion: `flex flex-col gap-3 border-t ${hairline} pt-5`,
  sumRow: `flex items-center justify-between gap-4 text-[length:var(--size-small)] ${muted}`,
  sumDiscount: 'text-[rgb(var(--color-text))]',
  totalRow: `flex items-baseline justify-between gap-4 border-t ${hairline} pt-4`,
  totalLabel: `text-[length:var(--size-h3)] ${heading}`,
  totalValue: `text-[length:var(--size-h2)] leading-none ${heading}`,

  // ---------- States ----------
  stateBox: 'mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-20 text-center',
  stateTitle: `text-[length:var(--size-h2)] ${heading}`,
  stateText: `text-[length:var(--size-small)] ${muted}`,
} as const;

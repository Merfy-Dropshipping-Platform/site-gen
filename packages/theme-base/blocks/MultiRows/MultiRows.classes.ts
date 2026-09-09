export const MultiRowsClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  // bg/text класс на container нужны чтобы containerColorScheme (отдельная схема
  // для контейнера рядов) реально проявлялась визуально. Без них color-scheme-N
  // wrapper менял только CSS-vars в inner scope, но container не имел bg/text
  // utility которые читают эти vars (паттерн CollapsibleSection / Catalog).
  container: 'mx-auto px-4 bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  width: {
    small: 'max-w-3xl',
    medium: 'max-w-5xl',
    large: 'max-w-7xl',
    full: 'w-full max-w-none',
  },
  stack: 'flex flex-col gap-y-[var(--spacing-grid-row-gap)]',
  row: {
    imageLeft:
      'grid grid-cols-1 md:grid-cols-2 gap-[var(--spacing-grid-col-gap)] items-center',
    imageRight:
      'grid grid-cols-1 md:grid-cols-2 gap-[var(--spacing-grid-col-gap)] items-center',
  },
  imageCol: {
    imageLeft: 'order-1',
    imageRight: 'order-1 md:order-2',
  },
  textCol: {
    imageLeft: 'order-2',
    imageRight: 'order-2 md:order-1',
  },
  textColBase: 'flex flex-col',
  textAlignment: {
    left: 'items-start text-left',
    center: 'items-center text-center',
    right: 'items-end text-right',
  },
  // aspect НЕ фиксирован здесь — задаётся per-row (row.size ?? секционная size)
  // через imageAspect[] ниже (мирроль rose aspectFor: small/medium/large).
  image:
    'w-full object-cover rounded-[var(--radius-media)]',
  // Высота/size ряда → aspect медиа (rose-порт aspectFor 1:1):
  // small='aspect-[429/309]', large='aspect-[430/500]', default(medium)='aspect-[429/444]'.
  imageAspect: {
    small: 'aspect-[429/309]',
    medium: 'aspect-[429/444]',
    large: 'aspect-[430/500]',
  },
  // rowHeading без фикс-размера — размер per-row (row.headingSize) через
  // rowHeadingSize[] ниже. rose маппит size→--size-section-heading px;
  // theme-base маппит size→Tailwind-классы (как секционный headingSize).
  rowHeading:
    '[font-family:var(--font-heading)] leading-tight text-[rgb(var(--color-heading))] mb-4',
  rowHeadingSize: {
    small: 'text-2xl md:text-3xl',
    medium: 'text-3xl md:text-4xl',
    large: 'text-4xl md:text-5xl',
  },
  // rowText без фикс-размера — размер per-row (row.textSize) через rowTextSize[]
  // ниже (мирроль rose: small/medium/large → Tailwind text-sm/base/lg).
  rowText:
    '[font-family:var(--font-body)] text-[rgb(var(--color-text))] leading-relaxed mb-6',
  rowTextSize: {
    small: 'text-sm',
    medium: 'text-base',
    large: 'text-lg',
  },
  button:
    'inline-flex items-center justify-center h-[var(--size-hero-button-h)] rounded-[var(--radius-button)] px-8 border border-[rgb(var(--color-button-border))] bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))] hover:bg-[rgb(var(--color-button-bg-hover))] hover:text-[rgb(var(--color-button-text-hover))] transition-colors no-underline',
  buttonSecondary:
    'inline-flex items-center justify-center h-[var(--size-hero-button-h)] rounded-[var(--radius-button)] px-8 border border-[rgb(var(--color-button-2-border))] bg-[rgb(var(--color-button-2-bg))] text-[rgb(var(--color-button-2-text))] hover:opacity-80 transition-opacity no-underline',
} as const;

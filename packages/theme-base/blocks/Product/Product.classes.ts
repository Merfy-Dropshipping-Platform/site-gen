export const ProductClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container: 'mx-auto max-w-[var(--container-max-width)] px-4',
  grid:
    'grid grid-cols-1 md:grid-cols-2 gap-[var(--spacing-grid-col-gap)] items-start',
  galleryCol: 'w-full',
  galleryMedia:
    'w-full aspect-square rounded-[var(--radius-media)] bg-[rgb(var(--color-surface))]',
  galleryThumbs: 'mt-4 grid grid-cols-4 gap-2',
  galleryThumb:
    'aspect-square rounded-[var(--radius-media)] bg-[rgb(var(--color-surface))] opacity-70',
  /**
   * Скругление медиа галереи — настройка темы «Скругления → Медиа»
   * (`--radius-media`; панель пишет её через ThemeSettingsPanel.mediaRadius).
   *
   * Отдельная роль, а не `galleryMedia`/`galleryThumb` целиком: у галереи
   * ЧЕТЫРЕ макета (split / carousel / two-columns / stacked), и каждый несёт
   * свою геометрию — ширину, `aspect-ratio`, порядок во flex. Те два ключа
   * описывают ещё и `w-full aspect-square`, заливку и `opacity-70` у
   * миниатюр; подключить их целиком = переписать вёрстку всех четырёх
   * макетов. Поэтому в разметку уезжает ровно роль «скругление».
   *
   * Запасные числа = сегодняшний вид байт-в-байт там, где токена нет
   * (`inline-small` — 12px, остальные — 8px; Figma 648:55733).
   */
  galleryMediaRadius: 'rounded-[var(--radius-media,8px)]',
  galleryMediaRadiusInlineSmall: 'rounded-[var(--radius-media,12px)]',
  galleryThumbRadius: 'rounded-[var(--radius-media,8px)]',
  infoCol: 'w-full',
  title:
    '[font-family:var(--font-heading)] text-[length:var(--size-hero-heading)] leading-tight text-[rgb(var(--color-heading))] mb-4',
  price:
    '[font-family:var(--font-body)] text-2xl text-[rgb(var(--color-heading))] mb-6',
  variants: 'mb-6',
  variantsLabel:
    '[font-family:var(--font-body)] text-sm text-[rgb(var(--color-muted))] mb-2',
  variantsRow: 'flex gap-2',
  variantPlaceholder:
    'h-10 w-10 rounded-[var(--radius-button)] bg-[rgb(var(--color-surface))] border border-[rgb(var(--color-button-border))]',
  addToCart:
    'inline-flex items-center justify-center h-[var(--size-hero-button-h)] rounded-[var(--radius-button)] px-8 bg-[rgb(var(--color-button-bg))] text-[rgb(var(--color-button-text))] border border-[rgb(var(--color-button-border))] [font-family:var(--font-body)]',
  description:
    'mt-10 [font-family:var(--font-body)] text-[rgb(var(--color-text))] leading-relaxed',
  descriptionHeading:
    '[font-family:var(--font-heading)] text-2xl text-[rgb(var(--color-heading))] mb-4',
} as const;

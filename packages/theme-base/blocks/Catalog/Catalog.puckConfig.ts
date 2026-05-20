import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

// Catalog — full /catalog page body block: filter sidebar + product grid +
// pagination + sort. Configuration mirrors PopularProducts (Коллекция
// товаров) plus filtering/sorting controls that exist only on the catalog
// page.

export const CatalogSchema = z.object({
  // 096 flux electronics — editable заголовок/подзаголовок (раньше были
  // hardcoded "КАТАЛОГ" / "Здесь начинается персональный стиль"). Themes
  // override через theme.json blockDefaults.Catalog.{categoryTitle,
  // categorySubtitle, categorySubtitleColor}.
  categoryTitle: z.string().optional(),
  categorySubtitle: z.string().optional(),
  /** 'muted' = текущий gray (default), 'accent' = оранжевый flux. */
  categorySubtitleColor: z.enum(['muted', 'accent']).optional(),
  // Subtitle visibility (matches Figma "Подзаголовок Показать/скрыть").
  subtitle: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),

  // Cards/columns sliders.
  cards: z.number().int().min(2).max(24).optional(),
  columns: z.number().int().min(1).max(6).optional(),

  // Product card sub-config — same as PopularProducts so themes share styling.
  productCard: z.object({
    buttonStyle: z.enum(['link', 'primary', 'secondary']).optional(),
    cardStyle: z.enum(['auto', 'portrait', 'square', 'wide']).optional(),
    cardBackground: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
    nextPhoto: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
    quickAdd: z.enum(['none', 'standard', 'cart']).optional(),
  }).optional(),

  // Filter / sort controls (catalog-only).
  showFilter: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
  filterPosition: z.enum(['top', 'side']).optional(),
  showSort: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),

  // Optional collection scoping: when set, restrict catalog to one collection.
  collectionSlug: z.string().nullable().optional(),

  // Legacy aliases kept for backward compat with revisions saved before the
  // Figma redesign — handled in Catalog.astro and live catalog.astro.
  showCollectionFilter: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
  showSidebar: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),

  colorScheme: z.string().optional(),
  // Figma 1:34017 — отдельная цветовая схема для внутреннего контейнера
  // (max-width:1320px wrapper). Когда не задана — используется colorScheme.
  containerColorScheme: z.string().optional(),
  // Optional: injected by preview pipeline so the SSG shell can client-fetch
  // real products from the storefront API. Not user-editable.
  siteId: z.string().optional(),
  // 084 Stage 3 vanilla pilot — additive grid + caption variants (legacy,
  // больше не показываются в sidebar — Figma 1:34017 их не имеет).
  gridAspect: z.enum(['auto', '1:1', '4:5']).optional(),
  cardCaptionStyle: z.enum(['default', 'uppercase']).optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type CatalogProps = z.infer<typeof CatalogSchema>;

export const CatalogPuckConfig: BlockPuckConfig<CatalogProps> = {
  label: 'Каталог товаров',
  category: 'products',
  // Figma 1:34017 sidebar "Группа товаров": Подзаголовок / Карточки / Колонки /
  // [Карточка товара] Стиль кнопки / Вид изображения / Следующее фото при
  // наведении / Быстрое добавление / [Фильтрация и сортировка] Фильтры /
  // Вид фильтра / Сортировка / Цветовая схема / Цветовая схема контейнера /
  // Отступы. Schema-driven, без хардкода в CustomFieldsPanel.
  fields: {
    // 097: hidden by design — Figma 1:34017 sidebar не имеет fields для
    // редактирования title/subtitle/subtitleColor. Эти props заполняются
    // через theme.json blockDefaults (per-theme defaults — flux:
    // "СМАРТФОНЫ"/"M Phone"/accent). Existing revisions с этими props
    // продолжают рендериться нормально через Astro.props.
    categoryTitle: { type: 'hidden', label: '' },
    categorySubtitle: { type: 'hidden', label: '' },
    categorySubtitleColor: { type: 'hidden', label: '' },
    subtitle: {
      type: 'toggle',
      label: 'Подзаголовок',
      options: [
        { label: 'Показать', value: 'true' },
        { label: 'Скрыть', value: 'false' },
      ],
    },
    cards: { type: 'slider', label: 'Карточки', min: 2, max: 24, step: 1 },
    columns: { type: 'slider', label: 'Колонки', min: 1, max: 6, step: 1 },
    ['_section_card' as never]: { type: 'section-header', label: 'Карточка товара' } as any,
    productCard: {
      type: 'object',
      label: '',
      objectFields: {
        buttonStyle: {
          type: 'select',
          label: 'Стиль кнопки',
          options: [
            { label: 'Основная', value: 'primary' },
            { label: 'Второстепенная', value: 'secondary' },
            { label: 'Ссылка', value: 'link' },
          ],
        },
        cardStyle: {
          type: 'select',
          label: 'Вид изображения',
          options: [
            { label: 'Портрет', value: 'portrait' },
            { label: 'Квадрат', value: 'square' },
            { label: 'Широкий', value: 'wide' },
          ],
        },
        nextPhoto: {
          type: 'toggle',
          label: 'Следующее фото при наведении',
          options: [
            { label: 'Вкл', value: 'true' },
            { label: 'Выкл', value: 'false' },
          ],
        },
        quickAdd: {
          type: 'select',
          label: 'Быстрое добавление',
          options: [
            { label: 'Нет', value: 'none' },
            { label: 'Стандарт', value: 'standard' },
            { label: 'Количество', value: 'cart' },
          ],
        },
      },
    },
    ['_section_filter' as never]: { type: 'section-header', label: 'Фильтрация и сортировка' } as any,
    showFilter: {
      type: 'toggle',
      label: 'Фильтры',
      options: [
        { label: 'Показать', value: 'true' },
        { label: 'Скрыть', value: 'false' },
      ],
    },
    filterPosition: {
      type: 'radio',
      label: 'Вид фильтра',
      options: [
        { label: 'Сверху', value: 'top' },
        { label: 'Сбоку', value: 'side' },
      ],
      visibleWhen: { field: 'showFilter', equals: 'true' },
    },
    showSort: {
      type: 'toggle',
      label: 'Сортировка',
      options: [
        { label: 'Показать', value: 'true' },
        { label: 'Скрыть', value: 'false' },
      ],
    },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    containerColorScheme: { type: 'colorScheme', label: 'Цветовая схема контейнера' },
    padding: { type: 'padding', label: 'Отступы' },
    // Hidden — не показаны в Figma 1:34017, но хранятся в revisions.
    collectionSlug: { type: 'hidden', label: '' },
    gridAspect: { type: 'hidden', label: '' },
    cardCaptionStyle: { type: 'hidden', label: '' },
  },
  defaults: {
    subtitle: 'true',
    cards: 8,
    columns: 4,
    productCard: {
      buttonStyle: 'secondary',
      cardBackground: 'false',
      cardStyle: 'portrait',
      nextPhoto: 'false',
      quickAdd: 'none',
    },
    showFilter: 'true',
    filterPosition: 'side',
    showSort: 'true',
    colorScheme: 'scheme-1',
    containerColorScheme: 'scheme-1',
    padding: { top: 120, bottom: 120 },
  },
  schema: CatalogSchema,
  maxInstances: 1,
  constraints: {
    padding: { min: 0, max: 160, step: 8 },
    minCards: 2,
    maxCards: 24,
    minColumns: 1,
    maxColumns: 6,
  },
};

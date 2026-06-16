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
  // aiText в puck config может писать как plain string или { text: '...' }
  // (legacy/новый shape). Render и build pipeline mapят оба варианта.
  categoryTitle: z.union([
    z.string(),
    z.object({ text: z.string().optional() }),
  ]).optional(),
  categorySubtitle: z.union([
    z.string(),
    z.object({ text: z.string().optional() }),
  ]).optional(),
  /** 'muted' = текущий gray (default), 'accent' = оранжевый flux. */
  categorySubtitleColor: z.enum(['muted', 'accent']).optional(),
  // Subtitle visibility (Figma 1:34015 — toggle «Подзаголовок» под заголовком).
  subtitle: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),

  // 098 Figma 1:21287 — Рассылка toggle (inline newsletter section внутри
  // каталога). NB: render-side нет в Catalog.astro — это placeholder
  // для будущего newsletter block embed. Сейчас no-op.
  newsletterEnabled: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),

  // Cards/columns sliders.
  cards: z.number().int().min(2).max(24).optional(),
  columns: z.number().int().min(1).max(6).optional(),

  // Product card sub-config — same as PopularProducts so themes share styling.
  productCard: z.object({
    buttonStyle: z.enum(['link', 'primary', 'secondary']).optional(),
    cardStyle: z.enum(['auto', 'portrait', 'square', 'wide']).optional(),
    cardBackground: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
    nextPhoto: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
    // 098: hover mode — "simple" просто swap на images[1] (по умолчанию).
    // "zones" = Avito-style hover-zones: hovering на разные 1/3-сегменты
    // изображения показывает images[1], images[2], images[3].
    nextPhotoMode: z.enum(['simple', 'zones']).optional(),
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
  // Figma 1:34015 sidebar "Группа товаров": Выбор коллекции / Подзаголовок /
  // Карточки / Колонки / [Содержание] Заголовок + Текст / [Карточка товара]
  // Стиль кнопки / Вид изображения / Следующее фото при наведении / Быстрое
  // добавление / [Фильтрация и сортировка] Фильтры / Вид фильтра / Сортировка /
  // Цветовая схема / Цветовая схема контейнера / Отступы. Schema-driven, без
  // хардкода в CustomFieldsPanel.
  fields: {
    // hidden by design — categorySubtitleColor заполняется через theme.json
    // blockDefaults (flux: accent); gridAspect/cardCaptionStyle — legacy
    // (084 vanilla pilot, Figma 1:34015 их не показывает). Existing revisions
    // с этими props продолжают рендериться нормально через Astro.props.
    categorySubtitleColor: { type: 'hidden', label: '' },
    gridAspect: { type: 'hidden', label: '' },
    cardCaptionStyle: { type: 'hidden', label: '' },

    // ──────────────────────────────────────────────────────────────────
    // Figma 1:34015 order — visible fields:
    // 1. Выбор коллекции (collectionPicker)
    // 2. Подзаголовок (toggle)
    // 3. Карточки (slider)
    // 4. Колонки (slider)
    // 5. [Содержание] categoryTitle / categorySubtitle (aiText — 098)
    // 6. [Карточка товара] productCard sub-fields
    // 7. [Фильтрация и сортировка] showFilter/filterPosition/showSort
    // 8. Цветовая схема
    // 9. Цветовая схема контейнера
    // 10. [Отступы] padding
    // ──────────────────────────────────────────────────────────────────
    collectionSlug: { type: 'collectionPicker', label: 'Выбор коллекции' } as any,
    // Figma 1:34015 — «Подзаголовок» идёт сразу под заголовком в верхней части
    // сайдбара. Управляет видимостью categorySubtitle (Catalog.astro:74).
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

    // «Содержание» — parity с PopularProducts (Коллекция товаров): user
    // может задать собственный heading и подзаголовок для каталога. Хранится
    // в существующих полях categoryTitle/categorySubtitle (раньше hidden,
    // заполнялось только через theme.json blockDefaults).
    ['_section_content' as never]: { type: 'section-header', label: 'Содержание' } as any,
    categoryTitle: {
      type: 'aiText',
      label: 'Заголовок',
      fieldType: 'title',
      placeholder: 'Ввести текст...',
    } as any,
    categorySubtitle: {
      type: 'aiText',
      label: 'Текст',
      fieldType: 'description',
      placeholder: 'Ввести текст...',
    } as any,

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
            { label: 'Авто', value: 'auto' },
            { label: 'Портрет', value: 'portrait' },
            { label: 'Квадрат', value: 'square' },
            { label: 'Широкий', value: 'wide' },
          ],
        },
        // Figma 1:34185-34635 — «Контейнер» карточки. С контейнером = контент с
        // внутр. отступом 12px (фото/кнопка inset, кнопка НЕ во всю ширину);
        // Без контейнера = флеш к краям (фото full-bleed, кнопка full-width).
        cardBackground: {
          type: 'select',
          label: 'Контейнер',
          options: [
            { label: 'Без контейнера', value: 'false' },
            { label: 'С контейнером', value: 'true' },
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
        // 098: simple = просто второе фото при hover; zones = Avito-style
        // hover-zones (1/3 image сегменты показывают images[1..3])
        nextPhotoMode: {
          type: 'select',
          label: 'Режим следующего фото',
          options: [
            { label: 'Просто следующее', value: 'simple' },
            { label: 'Зоны при наведении', value: 'zones' },
          ],
          visibleWhen: { field: 'productCard.nextPhoto', equals: 'true' },
        } as any,
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
    // Figma 1:34015 — отдельная схема для внутреннего контейнера
    // (max-width:1320px wrapper, Catalog.astro:147-150,210). 097 pattern:
    // НЕ задаём universal default — при unset рендер фоллбечит на colorScheme.
    containerColorScheme: { type: 'colorScheme', label: 'Цветовая схема контейнера' },
    padding: { type: 'padding', label: 'Отступы' },
  },
  defaults: {
    subtitle: 'true',
    newsletterEnabled: 'false', // 098: default off (Рассылка toggle Figma 1:21287)
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
    // Figma 1-21116 — верхний бар фильтров по умолчанию (top). Раньше 'side'
    // (sidebar прятался на узкой ширине → каталог без видимых фильтров).
    filterPosition: 'top',
    showSort: 'true',
    // 097 SYSTEMIC FIX: убраны colorScheme/containerColorScheme из universal
    // defaults. Pattern других блоков (Header/Hero/Footer/Collections/
    // PopularProducts): colorScheme в zod schema optional БЕЗ default value.
    // Это позволяет theme.json blockDefaults (flux: scheme-2) и revision data
    // быть единственным источником истины. Без этого Puck baked-in scheme-1
    // (dark) в state → edit любого поля шлёт scheme-1 → catalog рендерится
    // тёмным независимо от revision.
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

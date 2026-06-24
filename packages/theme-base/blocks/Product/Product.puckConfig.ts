import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const ProductSchema = z.object({
  productId: z.string(),
  // Pupa parity layout knobs.
  layout: z.enum(['stacked', 'two-columns', 'carousel', 'thumbnail', 'split']).optional(),
  size: z.enum(['small', 'medium', 'large']).optional(),
  photoPosition: z.enum(['left', 'right']).optional(),
  zoomMode: z.enum(['click', 'hover', 'none']).optional(),
  // 8-panel subsystem (named subsections shown in constructor outline).
  text: z.object({
    content: z.string().optional(),
    size: z.enum(['small', 'medium', 'large']).optional(),
  }).optional(),
  title: z.object({
    size: z.enum(['small', 'medium', 'large']).optional(),
  }).optional(),
  price: z.object({
    show: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
  }).optional(),
  variants: z.object({
    style: z.enum(['button', 'list']).optional(),
    shape: z.enum(['circle', 'square', 'none']).optional(),
  }).optional(),
  quantity: z.object({
    enabled: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
  }).optional(),
  buttons: z.object({
    addToCart: z.object({ text: z.string().optional() }).optional(),
    buyNow: z.object({ text: z.string().optional() }).optional(),
  }).optional(),
  description: z.object({
    content: z.string().optional(),
    size: z.enum(['small', 'medium', 'large']).optional(),
  }).optional(),
  share: z.object({ text: z.string().optional() }).optional(),
  // Legacy badge field (kept for back-compat with revisions saved before
  // text was introduced — adapter in Product.astro merges badge.text into text.content).
  badge: z.object({
    text: z.string().optional(),
    textSize: z.enum(['small', 'medium', 'large']).optional(),
  }).optional(),
  // Figma 1236-42145: тоггл «Динамическая кнопка» теперь скалярный ('true'/'false').
  // Union сохраняет back-compat со старыми ревизиями (объект { enabled }).
  dynamicButton: z.union([
    z.boolean(),
    z.enum(['true', 'false']),
    z.object({ enabled: z.enum(['true', 'false']).optional() }),
  ]).optional(),
  colorScheme: z.string().optional(),
  /**
   * Theme-driven visual variants (gallery layout, chips/dropdown, mono/accent
   * CTA, description visibility). Set via `theme.json blockDefaults.Product.visualConfig`.
   * Merchant doesn't see this in the constructor — there are no `fields` for it.
   */
  visualConfig: z.object({
    gallery: z.object({
      variant: z.enum(['wrap-large', 'inline-small']).optional(),
      showDiscountBadge: z.boolean().optional(),
    }).optional(),
    variantsType: z.enum(['chips', 'dropdown']).optional(),
    counter: z.object({ variant: z.enum(['inline', 'pill']).optional() }).optional(),
    showDescription: z.boolean().optional(),
  }).optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type ProductProps = z.infer<typeof ProductSchema>;

const sizeOptions = [
  { label: 'Маленький', value: 'small' },
  { label: 'Средний', value: 'medium' },
  { label: 'Большой', value: 'large' },
];

export const ProductPuckConfig: BlockPuckConfig<ProductProps> = {
  label: 'Товар',
  category: 'products',
  // Figma 1236-42145: 8 visible fields в порядке —
  // Выбор товара → Макет → Размер → Позиция фото → Увеличение →
  // Динамическая кнопка → Цветовая схема → Отступы.
  // Остальные (text/title/price/variants/quantity/buttons/description/share/
  // badge) — hiddenInMainPanel: редактируются через outline-click на subsection
  // в превью.
  fields: {
    productId: { type: 'productPicker', label: 'Выбор товара' },
    // Figma 314-34639: Макет → Размер.
    layout: {
      type: 'select',
      label: 'Макет',
      options: [
        { label: 'Сложенный', value: 'stacked' },
        { label: '2 колонки', value: 'two-columns' },
        // Figma 1236-42145: «Карусель» (был «Карусель снизу») + «Миниатюрный»
        // (был «Карусель слева» = split: thumbs col сбоку).
        { label: 'Карусель', value: 'carousel' },
        { label: 'Миниатюрный', value: 'split' },
      ],
    },
    size: {
      type: 'select',
      label: 'Размер',
      options: sizeOptions,
    },
    photoPosition: {
      type: 'radio',
      label: 'Позиция фото',
      options: [
        { label: 'Слева', value: 'left' },
        { label: 'Справа', value: 'right' },
      ],
    },
    zoomMode: {
      type: 'radio',
      label: 'Увеличение',
      options: [
        { label: 'Нажатие', value: 'click' },
        { label: 'Наведение', value: 'hover' },
      ],
    },
    // Figma 1236-42145: тоггл «Динамическая кнопка» (Скрыть/показать) между
    // «Увеличение» и «Цветовая схема». Управляет видимостью express-кнопки
    // «Купить сейчас» в секции. Топ-левел toggle: label рисует FieldGroup,
    // toggleLabel — статичная строка в самой строке тумблера.
    dynamicButton: {
      type: 'toggle',
      label: 'Динамическая кнопка',
      toggleLabel: 'Скрыть/показать',
      options: [
        { label: 'Показать', value: 'true' },
        { label: 'Скрыть', value: 'false' },
      ],
    } as any,
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },

    // Sub-panels — Figma 314-34639 их не показывает в main panel,
    // они открываются через outline click на subsection в превью.
    text: {
      type: 'object',
      label: 'Текст',
      hiddenInMainPanel: true,
      objectFields: {
        // Figma 1236-42145: rich-text c AI-генерацией (✨) + тулбар Ж/И.
        content: { type: 'aiText', label: 'Текст', placeholder: 'Ввести текст...', fieldType: 'description' },
        size: { type: 'select', label: 'Размер текста', options: sizeOptions },
      },
    } as any,
    title: {
      type: 'object',
      label: 'Название',
      hiddenInMainPanel: true,
      objectFields: {
        // Figma 1236-42145: «Размер» как dropdown (был radio).
        size: { type: 'select', label: 'Размер', options: sizeOptions },
      },
    } as any,
    // Figma 1236-42145: Стоимость — «Настройка недоступна / Изменения
    // проводятся на странице Товары». Цена берётся из БД товара.
    price: {
      type: 'disabledHint',
      label: 'Стоимость',
      hiddenInMainPanel: true,
      hintTitle: 'Настройка недоступна',
      hintBody: 'Изменения проводятся на странице',
      hintLinkText: 'Товары',
      hintLinkHref: '/products',
    } as any,
    variants: {
      type: 'object',
      label: 'Варианты',
      hiddenInMainPanel: true,
      objectFields: {
        style: {
          type: 'radio',
          label: 'Стиль',
          options: [
            { label: 'Кнопка', value: 'button' },
            { label: 'Список', value: 'list' },
          ],
        },
        // Figma 314-34673: «Вариации» (не «Форма»), последняя опция «Нет».
        shape: {
          type: 'radio',
          label: 'Вариации',
          options: [
            { label: 'Круг', value: 'circle' },
            { label: 'Квадрат', value: 'square' },
            { label: 'Нет', value: 'none' },
          ],
        },
      },
    } as any,
    // Figma 1236-42145: Количество — «Настройка недоступна / Изменения
    // проводятся на странице Товары».
    quantity: {
      type: 'disabledHint',
      label: 'Количество',
      hiddenInMainPanel: true,
      hintTitle: 'Настройка недоступна',
      hintBody: 'Изменения проводятся на странице',
      hintLinkText: 'Товары',
      hintLinkHref: '/products',
    } as any,
    // Figma 1236-42145: подпанель «Кнопки» = одна «Основная кнопка» с полем
    // «Текст» (пусто = скрыть кнопку). Вторая кнопка «Купить сейчас»
    // управляется тоглом «Динамическая кнопка» в основном сайдбаре.
    buttons: {
      type: 'object',
      label: 'Кнопки',
      hiddenInMainPanel: true,
      objectFields: {
        addToCart: {
          type: 'object',
          label: 'Основная кнопка',
          objectFields: {
            text: { type: 'text', label: 'Текст', placeholder: '*Оставьте пустой, чтобы скрыть' },
          },
        },
      },
    } as any,
    // Figma 314-34700: Описание — sub-panel показывает «Настройка недоступна /
    // Изменения проводятся на странице Товары». Контент берётся из БД товара,
    // не редактируется в конструкторе.
    description: {
      type: 'disabledHint',
      label: 'Описание',
      hiddenInMainPanel: true,
      hintTitle: 'Настройка недоступна',
      hintBody: 'Изменения проводятся на странице',
      hintLinkText: 'Товары',
      hintLinkHref: '/products',
    } as any,
    share: {
      type: 'object',
      label: 'Поделиться',
      hiddenInMainPanel: true,
      objectFields: { text: { type: 'text', label: 'Текст' } },
    } as any,

    // Legacy/internal — hidden совсем, данные сохраняются.
    // dynamicButton теперь видимый toggle (см. выше, между zoomMode и colorScheme).
    badge: { type: 'hidden', label: '' },
    visualConfig: { type: 'hidden', label: '' },
  },
  defaults: {
    productId: '',
    layout: 'two-columns',
    photoPosition: 'left',
    zoomMode: 'hover',
    text: { content: '', size: 'medium' },
    title: { size: 'medium' },
    // price/quantity больше не имеют тоггла (Figma 1236-42145 → disabledHint):
    // рендер показывает их всегда (priceProp/quantity === undefined → visible).
    // shape: 'none' = текущий pill-чип (rounded-[6px]). Дефолт намеренно
    // 'none', а не 'circle', чтобы существующие товары не регрессировали:
    // эффективный дефолт = как сейчас, а 'circle'/'square' — явный выбор
    // мерчанта (см. ProductVariants.astro SHAPE_RADIUS).
    variants: { style: 'button', shape: 'none' },
    // «Основная кнопка» (addToCart). Пусто = скрыть. «Купить сейчас» —
    // фиксированный лейбл, видимость через dynamicButton.
    buttons: { addToCart: { text: 'Добавить в корзину' } },
    dynamicButton: 'true',
    description: { content: '', size: 'medium' },
    share: { text: 'Поделиться' },
    size: 'medium',
    colorScheme: 'scheme-2',
    padding: { top: 80, bottom: 80 },
  },
  schema: ProductSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};

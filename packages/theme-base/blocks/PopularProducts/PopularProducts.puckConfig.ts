import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const PopularProductsSchema = z.object({
  heading: z.union([
    z.string(),
    z.object({
      text: z.string().optional(),
      alignment: z.enum(['left', 'center', 'right']).optional(),
      size: z.enum(['small', 'medium', 'large']).optional(),
    }),
  ]).optional(),
  subtitle: z.string().optional(),
  text: z.object({
    content: z.string().optional(),
    size: z.enum(['small', 'medium', 'large']).optional(),
  }).optional(),
  cards: z.number().int().min(2).max(24),
  columns: z.number().int().min(1).max(6),
  // Pupa parity.
  collection: z.string().nullable().optional(),
  productCard: z.object({
    columns: z.number().int().optional(),
    buttonStyle: z.enum(['link', 'primary', 'secondary']).optional(),
    cardStyle: z.enum(['auto', 'portrait', 'square', 'wide']).optional(),
    nextPhoto: z.enum(['true', 'false']).optional(),
    quickAdd: z.enum(['true', 'false']).optional(),
    buttonText: z.string().optional(),
  }).optional(),
  containerColorScheme: z.string().optional(),
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
  quickAdd: z.boolean().default(false),
  quickAddText: z.string().default('В КОРЗИНУ'),
  /**
   * 084 vanilla pilot — additive variant. Renders a 3-pip swatch overlay
   * over each product image (top-right) when the product has variant
   * groups with options. Default `undefined` (or `false`) preserves the
   * pre-084 cardMedia render — no overlay.
   */
  swatchOverlay: z.boolean().optional(),
  /**
   * 084 vanilla pilot — additive variant. Caption (title + price) casing
   * for product cards. Default `default` preserves pre-084 behaviour
   * (regular case). `uppercase` matches Vanilla home cards.
   */
  cardCaptionStyle: z.enum(['default', 'uppercase']).optional(),
  viewAll: z.object({
    show: z.boolean().optional(),
    text: z.string().optional(),
    href: z.string().optional(),
  }).optional(),
});

export type PopularProductsProps = z.infer<typeof PopularProductsSchema>;

export const PopularProductsPuckConfig: BlockPuckConfig<PopularProductsProps> = {
  label: 'Коллекция товаров',
  category: 'products',
  fields: {
    heading: {
      type: 'object',
      label: 'Заголовок',
      objectFields: {
        text: { type: 'text', label: 'Текст' },
        alignment: { type: 'alignment', label: 'Выравнивание' },
        size: {
          type: 'radio',
          label: 'Размер',
          options: [
            { label: 'Маленький', value: 'small' },
            { label: 'Средний', value: 'medium' },
            { label: 'Большой', value: 'large' },
          ],
        },
      },
    },
    subtitle: { type: 'textarea', label: 'Подзаголовок (опционально)' },
    text: {
      type: 'object',
      label: 'Текст',
      objectFields: {
        content: { type: 'textarea', label: 'Содержание' },
        size: {
          type: 'radio',
          label: 'Размер',
          options: [
            { label: 'Маленький', value: 'small' },
            { label: 'Средний', value: 'medium' },
            { label: 'Большой', value: 'large' },
          ],
        },
      },
    },
    collection: { type: 'collectionPicker', label: 'Коллекция' },
    cards: { type: 'slider', label: 'Количество карточек', min: 2, max: 24, step: 1 },
    columns: { type: 'slider', label: 'Колонок в ряд', min: 1, max: 6, step: 1 },
    productCard: {
      type: 'object',
      label: 'Карточка товара',
      objectFields: {
        columns: { type: 'slider', label: 'Колонок', min: 1, max: 6, step: 1 },
        buttonStyle: {
          type: 'select',
          label: 'Стиль кнопки',
          options: [
            { label: 'Ссылка', value: 'link' },
            { label: 'Основной', value: 'primary' },
            { label: 'Вторичный', value: 'secondary' },
          ],
        },
        cardStyle: {
          type: 'select',
          label: 'Стиль карточки',
          options: [
            { label: 'Авто', value: 'auto' },
            { label: 'Портрет', value: 'portrait' },
            { label: 'Квадрат', value: 'square' },
            { label: 'Широкая', value: 'wide' },
          ],
        },
        nextPhoto: {
          type: 'radio',
          label: 'Следующее фото при наведении',
          options: [
            { label: 'Да', value: 'true' },
            { label: 'Нет', value: 'false' },
          ],
        },
        quickAdd: {
          type: 'radio',
          label: 'Быстро добавить',
          options: [
            { label: 'Да', value: 'true' },
            { label: 'Нет', value: 'false' },
          ],
        },
        buttonText: {
          type: 'text',
          label: 'Текст кнопки',
          // Pupa parity: показывать только когда quickAdd='true'.
          visibleWhen: { field: 'quickAdd', equals: 'true' },
        },
      },
    },
    containerColorScheme: { type: 'colorScheme', label: 'Цветовая схема контейнера' },
    quickAdd: {
      type: 'radio',
      label: 'Кнопка "В корзину"',
      options: [
        { label: 'Показать', value: 'true' },
        { label: 'Скрыть', value: 'false' },
      ],
    },
    quickAddText: { type: 'text', label: 'Текст кнопки' },
    viewAll: {
      type: 'object',
      label: 'Кнопка "Смотреть ещё"',
      objectFields: {
        show: {
          type: 'radio',
          label: 'Показать',
          options: [
            { label: 'Да', value: true },
            { label: 'Нет', value: false },
          ],
        },
        text: { type: 'text', label: 'Текст' },
        href: { type: 'text', label: 'Ссылка' },
      },
    },
    swatchOverlay: { type: 'radio', label: 'Показать варианты на карточке' },
    cardCaptionStyle: {
      type: 'radio',
      label: 'Стиль подписи карточки',
      options: [
        { label: 'Обычный', value: 'default' },
        { label: 'Заглавные', value: 'uppercase' },
      ],
    },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },
  },
  defaults: {
    heading: 'Популярные товары',
    subtitle: '',
    cards: 4,
    columns: 4,
    padding: { top: 80, bottom: 80 },
    quickAdd: false,
    quickAddText: 'В КОРЗИНУ',
  },
  // ts-jest types `.default(false)` input as `boolean | undefined` which
  // conflicts with the inferred `quickAdd: boolean` in Props. Pre-existing
  // issue unrelated to 084. Cast keeps the runtime schema unchanged.
  schema: PopularProductsSchema as unknown as BlockPuckConfig<PopularProductsProps>['schema'],
  maxInstances: null,
  constraints: {
    padding: { min: 0, max: 160, step: 8 },
    minCards: 2,
    maxCards: 24,
    minColumns: 1,
    maxColumns: 6,
  },
};

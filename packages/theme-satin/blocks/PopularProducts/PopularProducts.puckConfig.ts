import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

// Satin PopularProducts — same prop shape as base. Schema duplicated locally
// because value imports from @merfy/theme-base don't resolve in compiled
// flat dist/astro-blocks layout (see scripts/compile-astro-blocks.mjs).

export const PopularProductsSchema = z.object({
  heading: z.union([
    z.string(),
    z.object({
      text: z.string().optional(),
      alignment: z.enum(['left', 'center', 'right']).optional(),
      size: z.enum(['small', 'medium', 'large']).optional(),
    }),
  ]).optional(),
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
});

export type PopularProductsProps = z.infer<typeof PopularProductsSchema>;

export const PopularProductsPuckConfig: BlockPuckConfig<PopularProductsProps> = {
  label: 'Популярные товары (Satin)',
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
    cards: { type: 'slider', label: 'Карточки', min: 2, max: 24, step: 1 },
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
          visibleWhen: { field: 'quickAdd', equals: 'true' },
        },
      },
    },
    containerColorScheme: { type: 'colorScheme', label: 'Цветовая схема контейнера' },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    columns: {
      type: 'radio',
      label: 'Колонок',
      options: [
        { label: '2', value: 2 },
        { label: '3', value: 3 },
        { label: '4', value: 4 },
      ],
    },
    padding: {
      type: 'object',
      label: 'Отступы',
      objectFields: {
        top: { type: 'number', label: 'Сверху (px)', min: 0, max: 160 },
        bottom: { type: 'number', label: 'Снизу (px)', min: 0, max: 160 },
      },
    },
  },
  defaults: {
    heading: 'Новые поступления',
    cards: 3,
    columns: 3,
    padding: { top: 40, bottom: 40 },
  },
  schema: PopularProductsSchema,
  maxInstances: null,
  constraints: {
    padding: { min: 0, max: 160, step: 8 },
    minCards: 2,
    maxCards: 24,
    minColumns: 2,
    maxColumns: 4,
  },
};

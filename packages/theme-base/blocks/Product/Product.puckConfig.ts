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
  dynamicButton: z.object({ enabled: z.enum(['true', 'false']).optional() }).optional(),
  colorScheme: z.string().optional(),
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
  fields: {
    productId: { type: 'productPicker', label: 'Выбор товара' },
    text: {
      type: 'object',
      label: 'Текст',
      objectFields: {
        content: { type: 'textarea', label: 'Содержание' },
        size: { type: 'radio', label: 'Размер', options: sizeOptions },
      },
    },
    title: {
      type: 'object',
      label: 'Название',
      objectFields: {
        size: { type: 'radio', label: 'Размер', options: sizeOptions },
      },
    },
    price: {
      type: 'object',
      label: 'Стоимость',
      objectFields: {
        show: {
          type: 'toggle',
          label: 'Показать',
          options: [
            { label: 'Показать', value: 'true' },
            { label: 'Скрыть', value: 'false' },
          ],
        },
      },
    },
    variants: {
      type: 'object',
      label: 'Варианты',
      objectFields: {
        style: {
          type: 'radio',
          label: 'Стиль',
          options: [
            { label: 'Кнопка', value: 'button' },
            { label: 'Список', value: 'list' },
          ],
        },
        shape: {
          type: 'radio',
          label: 'Форма',
          options: [
            { label: 'Круг', value: 'circle' },
            { label: 'Квадрат', value: 'square' },
            { label: 'Без формы', value: 'none' },
          ],
        },
      },
    },
    quantity: {
      type: 'object',
      label: 'Количество',
      objectFields: {
        enabled: {
          type: 'toggle',
          label: 'Показать',
          options: [
            { label: 'Показать', value: 'true' },
            { label: 'Скрыть', value: 'false' },
          ],
        },
      },
    },
    buttons: {
      type: 'object',
      label: 'Кнопки',
      objectFields: {
        addToCart: {
          type: 'object',
          label: 'В корзину',
          objectFields: { text: { type: 'text', label: 'Текст' } },
        },
        buyNow: {
          type: 'object',
          label: 'Купить сейчас',
          objectFields: { text: { type: 'text', label: 'Текст' } },
        },
      },
    },
    description: {
      type: 'object',
      label: 'Описание',
      objectFields: {
        content: { type: 'textarea', label: 'Содержание' },
        size: { type: 'radio', label: 'Размер', options: sizeOptions },
      },
    },
    share: {
      type: 'object',
      label: 'Поделиться',
      objectFields: { text: { type: 'text', label: 'Текст' } },
    },
    layout: {
      type: 'select',
      label: 'Макет',
      options: [
        { label: 'Стопкой', value: 'stacked' },
        { label: 'Две колонки', value: 'two-columns' },
        { label: 'Карусель', value: 'carousel' },
        { label: 'Миниатюры', value: 'thumbnail' },
        { label: 'Сплит', value: 'split' },
      ],
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
        { label: 'По клику', value: 'click' },
        { label: 'При наведении', value: 'hover' },
        { label: 'Выключено', value: 'none' },
      ],
    },
    size: {
      type: 'radio',
      label: 'Размер блока',
      options: sizeOptions,
    },
    badge: {
      type: 'object',
      label: 'Бейдж (legacy)',
      objectFields: {
        text: { type: 'text', label: 'Текст' },
        textSize: { type: 'radio', label: 'Размер', options: sizeOptions },
      },
    },
    dynamicButton: {
      type: 'object',
      label: 'Динамическая кнопка',
      objectFields: {
        enabled: {
          type: 'toggle',
          label: 'Включена',
          options: [
            { label: 'Да', value: 'true' },
            { label: 'Нет', value: 'false' },
          ],
        },
      },
    },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },
  },
  defaults: {
    productId: '',
    layout: 'two-columns',
    photoPosition: 'left',
    zoomMode: 'hover',
    text: { content: '', size: 'medium' },
    title: { size: 'medium' },
    price: { show: 'true' },
    variants: { style: 'button', shape: 'circle' },
    quantity: { enabled: 'true' },
    buttons: { addToCart: { text: 'В КОРЗИНУ' }, buyNow: { text: 'КУПИТЬ' } },
    description: { content: '', size: 'medium' },
    share: { text: 'Поделиться' },
    colorScheme: 'scheme-2',
    padding: { top: 80, bottom: 80 },
  },
  schema: ProductSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};

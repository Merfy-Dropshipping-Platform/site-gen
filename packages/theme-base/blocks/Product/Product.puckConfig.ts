import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const ProductSchema = z.object({
  productId: z.string(),
  // Pupa parity.
  layout: z.enum(['stacked', 'two-columns', 'carousel', 'thumbnail', 'split']).optional(),
  size: z.enum(['small', 'medium', 'large']).optional(),
  photoPosition: z.enum(['left', 'right']).optional(),
  zoomMode: z.enum(['click', 'hover', 'none']).optional(),
  // 8-panel subsystem.
  badge: z.object({
    text: z.string().optional(),
    textSize: z.enum(['small', 'medium', 'large']).optional(),
  }).optional(),
  title: z.object({
    size: z.enum(['small', 'medium', 'large']).optional(),
  }).optional(),
  variants: z.object({
    style: z.enum(['button', 'list']).optional(),
    shape: z.enum(['circle', 'square', 'none']).optional(),
  }).optional(),
  buttons: z.object({
    addToCart: z.object({ text: z.string().optional() }).optional(),
    buyNow: z.object({ text: z.string().optional() }).optional(),
  }).optional(),
  dynamicButton: z.object({ enabled: z.enum(['true', 'false']).optional() }).optional(),
  share: z.object({ text: z.string().optional() }).optional(),
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type ProductProps = z.infer<typeof ProductSchema>;

export const ProductPuckConfig: BlockPuckConfig<ProductProps> = {
  label: 'Товар',
  category: 'products',
  fields: {
    productId: { type: 'productPicker', label: 'Выбор товара' },
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
    badge: {
      type: 'object',
      label: 'Бейдж',
      objectFields: {
        text: { type: 'text', label: 'Текст' },
        textSize: {
          type: 'radio',
          label: 'Размер текста',
          options: [
            { label: 'Маленький', value: 'small' },
            { label: 'Средний', value: 'medium' },
            { label: 'Большой', value: 'large' },
          ],
        },
      },
    },
    title: {
      type: 'object',
      label: 'Название',
      objectFields: {
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
    buttons: {
      type: 'object',
      label: 'Кнопки',
      objectFields: {
        addToCart: {
          type: 'object',
          label: 'В корзину',
          objectFields: {
            text: { type: 'text', label: 'Текст' },
          },
        },
        buyNow: {
          type: 'object',
          label: 'Купить сейчас',
          objectFields: {
            text: { type: 'text', label: 'Текст' },
          },
        },
      },
    },
    dynamicButton: {
      type: 'object',
      label: 'Динамическая кнопка',
      objectFields: {
        enabled: {
          type: 'radio',
          label: 'Включена',
          options: [
            { label: 'Да', value: 'true' },
            { label: 'Нет', value: 'false' },
          ],
        },
      },
    },
    share: {
      type: 'object',
      label: 'Поделиться',
      objectFields: {
        text: { type: 'text', label: 'Текст' },
      },
    },
    size: {
      type: 'radio',
      label: 'Размер',
      options: [
        { label: 'Маленький', value: 'small' },
        { label: 'Средний', value: 'medium' },
        { label: 'Большой', value: 'large' },
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
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },
  },
  defaults: {
    productId: '',
    padding: { top: 80, bottom: 80 },
  },
  schema: ProductSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};

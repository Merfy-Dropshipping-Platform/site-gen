import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const ProductSchema = z.object({
  productId: z.string(),
  // Pupa parity.
  layout: z.enum(['stacked', 'split']).optional(),
  size: z.enum(['small', 'medium', 'large']).optional(),
  photoPosition: z.enum(['left', 'right']).optional(),
  zoomMode: z.enum(['click', 'hover', 'none']).optional(),
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type ProductProps = z.infer<typeof ProductSchema>;

export const ProductPuckConfig: BlockPuckConfig<ProductProps> = {
  label: 'Товар (PDP)',
  category: 'products',
  fields: {
    productId: { type: 'productPicker', label: 'Выбор товара' },
    layout: {
      type: 'radio',
      label: 'Макет',
      options: [
        { label: 'Стопкой', value: 'stacked' },
        { label: 'Сплит', value: 'split' },
      ],
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

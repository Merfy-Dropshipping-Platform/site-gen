import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const PopularProductsSchema = z.object({
  heading: z.string(),
  subtitle: z.string().optional(),
  cards: z.number().int().min(2).max(24),
  columns: z.number().int().min(1).max(6),
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
  quickAdd: z.boolean().default(false),
  quickAddText: z.string().default('В КОРЗИНУ'),
});

export type PopularProductsProps = z.infer<typeof PopularProductsSchema>;

export const PopularProductsPuckConfig: BlockPuckConfig<PopularProductsProps> = {
  label: 'Популярные товары',
  category: 'products',
  fields: {
    heading: { type: 'text', label: 'Заголовок' },
    subtitle: { type: 'textarea', label: 'Подзаголовок (опционально)' },
    cards: { type: 'slider', label: 'Количество карточек', min: 2, max: 24, step: 1 },
    columns: { type: 'slider', label: 'Колонок в ряд', min: 1, max: 6, step: 1 },
    quickAdd: {
      type: 'radio',
      label: 'Кнопка "В корзину"',
      options: [
        { label: 'Показать', value: 'true' },
        { label: 'Скрыть', value: 'false' },
      ],
    },
    quickAddText: { type: 'text', label: 'Текст кнопки' },
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
  schema: PopularProductsSchema,
  maxInstances: null,
  constraints: {
    padding: { min: 0, max: 160, step: 8 },
    minCards: 2,
    maxCards: 24,
    minColumns: 1,
    maxColumns: 6,
  },
};

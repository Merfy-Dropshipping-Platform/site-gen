import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const PopularProductsSchema = z.object({
  heading: z.string(),
  cards: z.number().int().min(2).max(24),
  columns: z.number().int().min(1).max(6),
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
    cards: { type: 'number', label: 'Карточки (2-24)' },
    columns: { type: 'number', label: 'Колонки (1-6)' },
    padding: { type: 'object', label: 'Отступы' },
    quickAdd: { type: 'radio', label: 'Кнопка "в корзину"' },
    quickAddText: { type: 'text', label: 'Текст кнопки' },
  },
  defaults: {
    heading: 'Популярные товары',
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

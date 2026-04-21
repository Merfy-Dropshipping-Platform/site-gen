import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const PopularProductsSchema = z.object({
  heading: z.string(),
  cards: z.number().int().min(2).max(24),
  columns: z.number().int().min(1).max(6),
  colorScheme: z.number().int().min(1).max(4),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type PopularProductsProps = z.infer<typeof PopularProductsSchema>;

export const PopularProductsPuckConfig: BlockPuckConfig<PopularProductsProps> = {
  label: 'Популярные товары',
  category: 'products',
  fields: {
    heading: { type: 'text', label: 'Заголовок' },
    cards: { type: 'number', label: 'Карточки (2-24)' },
    columns: { type: 'number', label: 'Колонки (1-6)' },
    colorScheme: { type: 'number', label: 'Цветовая схема' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    heading: 'Популярные товары',
    cards: 4,
    columns: 4,
    colorScheme: 1,
    padding: { top: 80, bottom: 80 },
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

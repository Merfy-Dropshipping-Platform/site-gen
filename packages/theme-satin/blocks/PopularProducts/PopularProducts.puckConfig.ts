import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

// Satin PopularProducts — same prop shape as base. Schema duplicated locally
// because value imports from @merfy/theme-base don't resolve in compiled
// flat dist/astro-blocks layout (see scripts/compile-astro-blocks.mjs).

export const PopularProductsSchema = z.object({
  heading: z.string(),
  cards: z.number().int().min(2).max(24),
  columns: z.number().int().min(1).max(6),
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
    heading: { type: 'text', label: 'Заголовок' },
    cards: { type: 'number', label: 'Карточки (2-24)', min: 2, max: 24 },
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

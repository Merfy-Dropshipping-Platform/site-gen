import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

// Bloom Catalog — same prop shape as base. Theme overrides only adjust label /
// defaults / category. Live render is mounted by `catalog.astro` (which inlines
// CatalogIsland) — this Puck binding is for constructor preview + props.

export const CatalogSchema = z.object({
  collectionSlug: z.string().optional(),
  showCollectionFilter: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
  showSidebar: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type CatalogProps = z.infer<typeof CatalogSchema>;

export const CatalogPuckConfig: BlockPuckConfig<CatalogProps> = {
  label: 'Каталог (фильтры + товары)',
  category: 'products',
  fields: {
    collectionSlug: { type: 'text', label: 'Slug коллекции' },
    showCollectionFilter: {
      type: 'radio',
      label: 'Показывать фильтр коллекций',
      options: [
        { label: 'Да', value: 'true' },
        { label: 'Нет', value: 'false' },
      ],
    },
    showSidebar: {
      type: 'radio',
      label: 'Показывать боковой фильтр',
      options: [
        { label: 'Да', value: 'true' },
        { label: 'Нет', value: 'false' },
      ],
    },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
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
    showCollectionFilter: 'false',
    showSidebar: 'false',
    padding: { top: 40, bottom: 80 },
  },
  schema: CatalogSchema,
  maxInstances: 1,
  constraints: {
    padding: { min: 0, max: 160, step: 8 },
  },
};

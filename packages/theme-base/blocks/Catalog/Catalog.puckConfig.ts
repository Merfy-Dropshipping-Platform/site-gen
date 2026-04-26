import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

// Catalog — full /catalog page body block: filter sidebar + product grid +
// pagination + sort. This is the Puck binding for the "pupa-branch" catalog
// experience (see templates/astro/satin/src/components/react/CatalogIsland).
// Live render is wired through the theme template's Catalog.astro wrapper.

export const CatalogSchema = z.object({
  collectionSlug: z.string().optional(),
  showCollectionFilter: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
  showSidebar: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
  colorScheme: z.string().optional(),
  // Optional: injected by preview pipeline so the SSG shell can client-fetch
  // real products from the storefront API. Not user-editable.
  siteId: z.string().optional(),
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
    collectionSlug: { type: 'text', label: 'Slug коллекции (если страница коллекции)' },
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
    padding: { type: 'padding', label: 'Отступы' },
  },
  defaults: {
    showCollectionFilter: 'true',
    showSidebar: 'true',
    padding: { top: 40, bottom: 80 },
  },
  schema: CatalogSchema,
  maxInstances: 1,
  constraints: {
    padding: { min: 0, max: 160, step: 8 },
  },
};

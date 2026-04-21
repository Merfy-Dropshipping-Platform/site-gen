import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

const CollectionItemSchema = z.object({
  id: z.string(),
  collectionId: z.string().nullable(), // nullable until merchant picks
  heading: z.string(),
  description: z.string().optional(),
});

export const CollectionsSchema = z.object({
  heading: z.string(),
  collections: z.array(CollectionItemSchema).min(1).max(10),
  columns: z.number().int().min(1).max(6),
  colorScheme: z.number().int().min(1).max(4),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type CollectionsProps = z.infer<typeof CollectionsSchema>;

export const CollectionsPuckConfig: BlockPuckConfig<CollectionsProps> = {
  label: 'Коллекции',
  category: 'products',
  fields: {
    heading: { type: 'text', label: 'Заголовок' },
    collections: { type: 'array', label: 'Коллекции' },
    columns: { type: 'number', label: 'Колонки (1-6)' },
    colorScheme: { type: 'number', label: 'Цветовая схема' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    heading: 'Коллекции',
    collections: [
      { id: 'col-1', collectionId: null, heading: 'Коллекция 1', description: '' },
      { id: 'col-2', collectionId: null, heading: 'Коллекция 2', description: '' },
      { id: 'col-3', collectionId: null, heading: 'Коллекция 3', description: '' },
    ],
    columns: 3,
    colorScheme: 1,
    padding: { top: 80, bottom: 80 },
  },
  schema: CollectionsSchema,
  maxInstances: null,
  constraints: {
    padding: { min: 0, max: 160, step: 8 },
    minColumns: 1,
    maxColumns: 6,
    maxItems: 10,
  },
};

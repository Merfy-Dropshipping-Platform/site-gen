import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const PublicationsSchema = z.object({
  heading: z.string(),
  columns: z.number().int().min(1).max(4),
  cards: z.number().int().min(1).max(4),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type PublicationsProps = z.infer<typeof PublicationsSchema>;

export const PublicationsPuckConfig: BlockPuckConfig<PublicationsProps> = {
  label: 'Публикации',
  category: 'content',
  fields: {
    heading: { type: 'text', label: 'Заголовок' },
    columns: { type: 'number', label: 'Колонки (1-4)' },
    cards: { type: 'number', label: 'Карточки (1-4)' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    heading: 'Публикации',
    columns: 3,
    cards: 3,
    padding: { top: 80, bottom: 80 },
  },
  schema: PublicationsSchema,
  maxInstances: null,
  constraints: {
    padding: { min: 0, max: 160, step: 8 },
    minCards: 1,
    maxCards: 4,
    minColumns: 1,
    maxColumns: 4,
  },
};

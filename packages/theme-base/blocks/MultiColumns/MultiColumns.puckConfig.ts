import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

const MultiColumnItemSchema = z.object({
  id: z.string(),
  heading: z.string(),
  text: z.string(),
  imageUrl: z.string(),
});

export const MultiColumnsSchema = z.object({
  columns: z.array(MultiColumnItemSchema).min(1).max(10),
  displayColumns: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
  ]),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type MultiColumnsProps = z.infer<typeof MultiColumnsSchema>;

export const MultiColumnsPuckConfig: BlockPuckConfig<MultiColumnsProps> = {
  label: 'Мультиколонны',
  category: 'layout',
  fields: {
    columns: { type: 'array', label: 'Колонки' },
    displayColumns: { type: 'number', label: 'Колонок в ряд (1-4)' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    columns: [
      { id: 'col-1', heading: 'Колонка 1', text: 'Описание первой колонки.', imageUrl: '' },
      { id: 'col-2', heading: 'Колонка 2', text: 'Описание второй колонки.', imageUrl: '' },
      { id: 'col-3', heading: 'Колонка 3', text: 'Описание третьей колонки.', imageUrl: '' },
    ],
    displayColumns: 3,
    padding: { top: 80, bottom: 80 },
  },
  schema: MultiColumnsSchema,
  maxInstances: null,
  constraints: {
    padding: { min: 0, max: 160, step: 8 },
    minColumns: 1,
    maxColumns: 4,
    maxItems: 10,
  },
};

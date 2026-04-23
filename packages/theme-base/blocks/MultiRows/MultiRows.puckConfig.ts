import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

const MultiRowItemSchema = z.object({
  id: z.string(),
  heading: z.string(),
  text: z.string(),
  imageUrl: z.string(),
  imagePosition: z.enum(['left', 'right']),
  button: z.object({ text: z.string(), href: z.string() }),
});

export const MultiRowsSchema = z.object({
  rows: z.array(MultiRowItemSchema).min(1).max(10),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type MultiRowsProps = z.infer<typeof MultiRowsSchema>;

export const MultiRowsPuckConfig: BlockPuckConfig<MultiRowsProps> = {
  label: 'Мультиряды',
  category: 'layout',
  fields: {
    rows: { type: 'array', label: 'Ряды' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    rows: [
      {
        id: 'row-1',
        heading: 'Первый ряд',
        text: 'Описание первого ряда. Изображение слева.',
        imageUrl: '',
        imagePosition: 'left',
        button: { text: 'Подробнее', href: '/about' },
      },
      {
        id: 'row-2',
        heading: 'Второй ряд',
        text: 'Описание второго ряда. Изображение справа.',
        imageUrl: '',
        imagePosition: 'right',
        button: { text: 'Узнать больше', href: '/about' },
      },
    ],
    padding: { top: 80, bottom: 80 },
  },
  schema: MultiRowsSchema,
  maxInstances: null,
  constraints: {
    padding: { min: 0, max: 160, step: 8 },
    maxItems: 10,
  },
};

import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

const CollapsibleItemSchema = z.object({
  id: z.string(),
  heading: z.string(),
  content: z.string(),
});

export const CollapsibleSectionSchema = z.object({
  heading: z.string(),
  sections: z.array(CollapsibleItemSchema).min(1).max(10),
  colorScheme: z.number().int().min(1).max(4),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type CollapsibleSectionProps = z.infer<typeof CollapsibleSectionSchema>;

export const CollapsibleSectionPuckConfig: BlockPuckConfig<CollapsibleSectionProps> = {
  label: 'Сворачиваемый раздел',
  category: 'content',
  fields: {
    heading: { type: 'text', label: 'Заголовок раздела' },
    sections: { type: 'array', label: 'Пункты' },
    colorScheme: { type: 'number', label: 'Цветовая схема' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    heading: 'Часто задаваемые вопросы',
    sections: [
      {
        id: 'section-1',
        heading: 'Первый вопрос',
        content: 'Ответ на первый вопрос. Поддерживается базовое HTML-форматирование.',
      },
      {
        id: 'section-2',
        heading: 'Второй вопрос',
        content: 'Ответ на второй вопрос.',
      },
    ],
    colorScheme: 1,
    padding: { top: 80, bottom: 80 },
  },
  schema: CollapsibleSectionSchema,
  maxInstances: null,
  constraints: {
    padding: { min: 0, max: 160, step: 8 },
    maxItems: 10,
  },
};

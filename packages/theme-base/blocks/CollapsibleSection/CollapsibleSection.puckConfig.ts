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
  // Pupa parity.
  headingAlignment: z.enum(['left', 'center', 'right']).optional(),
  headingSize: z.enum(['small', 'medium', 'large']).optional(),
  containerEnabled: z.enum(['true', 'false']).optional(),
  colorScheme: z.string().optional(),
  containerColorScheme: z.string().optional(),
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
    headingAlignment: { type: 'alignment', label: 'Выравнивание заголовка' },
    headingSize: {
      type: 'radio',
      label: 'Размер заголовка',
      options: [
        { label: 'Маленький', value: 'small' },
        { label: 'Средний', value: 'medium' },
        { label: 'Большой', value: 'large' },
      ],
    },
    containerEnabled: {
      type: 'radio',
      label: 'Контейнер',
      options: [
        { label: 'Показать', value: 'true' },
        { label: 'Скрыть', value: 'false' },
      ],
    },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    containerColorScheme: { type: 'colorScheme', label: 'Цветовая схема контейнера' },
    sections: {
      type: 'array',
      label: 'Пункты (макс 10)',
      arrayFields: {
        heading: { type: 'text', label: 'Вопрос / заголовок' },
        content: { type: 'textarea', label: 'Ответ / содержимое' },
      },
      defaultItemProps: {
        id: '',
        heading: 'Новый пункт',
        content: 'Содержимое пункта',
      },
      max: 10,
    },
    padding: { type: 'padding', label: 'Отступы' },
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
    padding: { top: 80, bottom: 80 },
  },
  schema: CollapsibleSectionSchema,
  maxInstances: null,
  constraints: {
    padding: { min: 0, max: 160, step: 8 },
    maxItems: 10,
  },
};

import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const PublicationsSchema = z.object({
  heading: z.string(),
  columns: z.number().int().min(1).max(4),
  cards: z.number().int().min(1).max(4),
  // Pupa parity.
  publicationType: z.string().optional(),
  cardsCount: z.number().int().optional(),
  columnsCount: z.number().int().optional(),
  headingAlignment: z.enum(['left', 'center', 'right']).optional(),
  headingSize: z.enum(['small', 'medium', 'large']).optional(),
  dateTime: z.object({ enabled: z.enum(['true', 'false']) }).optional(),
  colorScheme: z.string().optional(),
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
    publicationType: { type: 'text', label: 'Тип публикации' },
    cardsCount: { type: 'slider', label: 'Карточки', min: 1, max: 12, step: 1 },
    columnsCount: { type: 'slider', label: 'Колонок', min: 1, max: 6, step: 1 },
    columns: { type: 'number', label: 'Колонки (1-4)' },
    cards: { type: 'number', label: 'Карточки (1-4)' },
    dateTime: {
      type: 'object',
      label: 'Дата и время',
      objectFields: {
        enabled: {
          type: 'radio',
          label: 'Показывать',
          options: [
            { label: 'Да', value: 'true' },
            { label: 'Нет', value: 'false' },
          ],
        },
      },
    },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },
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

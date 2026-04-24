import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

// Satin MultiRows — same prop shape as base. Schema duplicated locally because
// value imports from @merfy/theme-base don't resolve in compiled dist layout.

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
  label: 'Мультиряды (Satin)',
  category: 'layout',
  fields: {
    rows: {
      type: 'array',
      label: 'Ряды',
      arrayFields: {
        id: { type: 'text', label: 'ID' },
        heading: { type: 'text', label: 'Заголовок' },
        text: { type: 'textarea', label: 'Текст' },
        imageUrl: { type: 'text', label: 'URL изображения' },
        imagePosition: {
          type: 'radio',
          label: 'Позиция изображения',
          options: [
            { label: 'Слева', value: 'left' },
            { label: 'Справа', value: 'right' },
          ],
        },
        button: {
          type: 'object',
          label: 'Кнопка',
          objectFields: {
            text: { type: 'text', label: 'Текст' },
            href: { type: 'text', label: 'Ссылка' },
          },
        },
      },
      defaultItemProps: {
        id: 'row-new',
        heading: 'Новый ряд',
        text: '',
        imageUrl: '',
        imagePosition: 'left',
        button: { text: 'Подробнее', href: '/' },
      },
      max: 10,
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
    rows: [
      {
        id: 'row-1',
        heading: 'ЛУЧШИЕ ТКАНИ ДЛЯ ВАС',
        text: 'Мы используем только натуральные материалы высочайшего качества. Каждая коллекция создаётся с вниманием к деталям.',
        imageUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=80',
        imagePosition: 'left',
        button: { text: 'Подробнее', href: '/about' },
      },
      {
        id: 'row-2',
        heading: 'ФИЛОСОФИЯ БРЕНДА',
        text: 'Элегантность в каждой детали. Наша миссия — создавать одежду, которая подчёркивает индивидуальность.',
        imageUrl: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=1200&q=80',
        imagePosition: 'right',
        button: { text: 'О нас', href: '/about' },
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

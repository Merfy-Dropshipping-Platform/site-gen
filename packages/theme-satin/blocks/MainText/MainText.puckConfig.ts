import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const MainTextSchema = z.object({
  heading: z.string(),
  text: z.string(),
  alignment: z.enum(['left', 'center', 'right']),
  cta: z
    .object({
      text: z.string(),
      href: z.string(),
      variant: z.enum(['primary', 'black', 'white']).optional(),
    })
    .optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type MainTextProps = z.infer<typeof MainTextSchema>;

export const MainTextPuckConfig: BlockPuckConfig<MainTextProps> = {
  label: 'Основной текст (Satin)',
  category: 'content',
  fields: {
    heading: { type: 'text', label: 'Заголовок' },
    text: { type: 'textarea', label: 'Текст (поддержка HTML <b>, <i>)' },
    alignment: {
      type: 'radio',
      label: 'Выравнивание',
      options: [
        { label: 'Слева', value: 'left' },
        { label: 'По центру', value: 'center' },
        { label: 'Справа', value: 'right' },
      ],
    },
    cta: {
      type: 'object',
      label: 'Кнопка (опционально)',
      objectFields: {
        text: { type: 'text', label: 'Текст' },
        href: { type: 'text', label: 'Ссылка' },
        variant: {
          type: 'radio',
          label: 'Стиль',
          options: [
            { label: 'Основной', value: 'primary' },
            { label: 'Чёрная', value: 'black' },
            { label: 'Белая', value: 'white' },
          ],
        },
      },
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
    heading: 'НАША ИСТОРИЯ',
    text: 'Создаём одежду с любовью к деталям. Наша команда вдохновляется классическими силуэтами и современными материалами, чтобы подарить вам вещи на годы.',
    alignment: 'center',
    padding: { top: 80, bottom: 80 },
  },
  schema: MainTextSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};

import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const MainTextSchema = z.object({
  heading: z.union([
    z.string(),
    z.object({
      text: z.string().optional(),
      size: z.enum(['small', 'medium', 'large']).optional(),
    }),
  ]).optional(),
  text: z.union([
    z.string(),
    z.object({
      content: z.string().optional(),
      size: z.enum(['small', 'medium', 'large']).optional(),
    }),
  ]).optional(),
  alignment: z.enum(['left', 'center', 'right']).optional(),
  button: z.object({
    text: z.string().optional(),
    link: z.string().optional(),
  }).optional(),
  cta: z
    .object({
      text: z.string(),
      href: z.string(),
      variant: z.enum(['primary', 'black', 'white']).optional(),
    })
    .optional(),
  // Pupa parity.
  headingSize: z.enum(['small', 'medium', 'large']).optional(),
  position: z.enum(['left', 'center', 'right']).optional(),
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type MainTextProps = z.infer<typeof MainTextSchema>;

export const MainTextPuckConfig: BlockPuckConfig<MainTextProps> = {
  label: 'Основной текст',
  category: 'content',
  fields: {
    heading: {
      type: 'object',
      label: 'Заголовок',
      objectFields: {
        text: { type: 'text', label: 'Текст' },
        size: {
          type: 'radio',
          label: 'Размер',
          options: [
            { label: 'Маленький', value: 'small' },
            { label: 'Средний', value: 'medium' },
            { label: 'Большой', value: 'large' },
          ],
        },
      },
    },
    text: {
      type: 'object',
      label: 'Текст',
      objectFields: {
        content: { type: 'textarea', label: 'Содержание' },
        size: {
          type: 'radio',
          label: 'Размер',
          options: [
            { label: 'Маленький', value: 'small' },
            { label: 'Средний', value: 'medium' },
            { label: 'Большой', value: 'large' },
          ],
        },
      },
    },
    button: {
      type: 'object',
      label: 'Кнопка',
      objectFields: {
        text: { type: 'text', label: 'Текст' },
        link: { type: 'pagePicker', label: 'Ссылка' },
      },
    },
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
    headingSize: {
      type: 'radio',
      label: 'Размер заголовка',
      options: [
        { label: 'Маленький', value: 'small' },
        { label: 'Средний', value: 'medium' },
        { label: 'Большой', value: 'large' },
      ],
    },
    position: { type: 'alignment', label: 'Положение секции' },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
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

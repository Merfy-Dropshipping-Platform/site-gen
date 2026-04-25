import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const NewsletterSchema = z.object({
  heading: z.union([
    z.string(),
    z.object({
      text: z.string().optional(),
      alignment: z.enum(['left', 'center', 'right']).optional(),
      size: z.enum(['small', 'medium', 'large']).optional(),
    }),
  ]).optional(),
  description: z.string().optional(),
  text: z.object({
    content: z.string().optional(),
    size: z.enum(['small', 'medium', 'large']).optional(),
  }).optional(),
  placeholder: z.string(),
  buttonText: z.string(),
  position: z.enum(['left', 'center', 'right']).optional(),
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type NewsletterProps = z.infer<typeof NewsletterSchema>;

export const NewsletterPuckConfig: BlockPuckConfig<NewsletterProps> = {
  label: 'Подписка на рассылку',
  category: 'form',
  fields: {
    heading: {
      type: 'object',
      label: 'Заголовок',
      objectFields: {
        text: { type: 'text', label: 'Текст' },
        alignment: { type: 'alignment', label: 'Выравнивание' },
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
    description: { type: 'text', label: 'Описание' },
    placeholder: { type: 'text', label: 'Плейсхолдер' },
    buttonText: { type: 'text', label: 'Кнопка' },
    position: { type: 'alignment', label: 'Положение секции' },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },
  },
  defaults: {
    heading: 'Подпишись на новости',
    description: 'Узнавай о новинках и акциях первым',
    placeholder: 'Твой email',
    buttonText: 'Подписаться',
    padding: { top: 80, bottom: 80 },
  },
  schema: NewsletterSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};

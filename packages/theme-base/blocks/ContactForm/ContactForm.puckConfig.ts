import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

// Constructor uses string "true"/"false" for boolean-like flags.
// Accept both string and boolean forms; Astro renderer normalizes at render time.
const boolLike = z.union([z.boolean(), z.literal('true'), z.literal('false')]);

const FieldSchema = z.object({
  enabled: boolLike,
  required: boolLike,
  label: z.string(),
});

export const ContactFormSchema = z.object({
  heading: z.union([
    z.string(),
    z.object({
      text: z.string().optional(),
      alignment: z.enum(['left', 'center', 'right']).optional(),
      size: z.enum(['small', 'medium', 'large']).optional(),
    }),
  ]).optional(),
  description: z.string(),
  fields: z.object({
    name: FieldSchema,
    email: FieldSchema,
    phone: FieldSchema,
    message: FieldSchema,
  }),
  buttonText: z.string(),
  headingAlignment: z.enum(['left', 'center', 'right']).optional(),
  headingSize: z.enum(['small', 'medium', 'large']).optional(),
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type ContactFormProps = z.infer<typeof ContactFormSchema>;

export const ContactFormPuckConfig: BlockPuckConfig<ContactFormProps> = {
  label: 'Форма обратной связи',
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
    description: { type: 'text', label: 'Описание' },
    fields: { type: 'object', label: 'Поля формы' },
    buttonText: { type: 'text', label: 'Кнопка' },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },
  },
  defaults: {
    heading: 'Связаться с нами',
    description: 'Оставьте заявку — ответим в течение рабочего дня.',
    fields: {
      name: { enabled: true, required: true, label: 'Имя' },
      email: { enabled: true, required: true, label: 'Email' },
      phone: { enabled: true, required: false, label: 'Телефон' },
      message: { enabled: true, required: false, label: 'Сообщение' },
    },
    buttonText: 'Отправить',
    padding: { top: 80, bottom: 80 },
  },
  schema: ContactFormSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};

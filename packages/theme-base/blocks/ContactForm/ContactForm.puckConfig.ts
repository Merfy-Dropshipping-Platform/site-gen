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
  label: 'Контактная форма',
  category: 'form',
  // Figma 314-35069: Содержание (header) / Заголовок (aiText) /
  // Размер заголовка / Цветовая схема / Отступы.
  fields: {
    ['_contentSection' as never]: { type: 'section-header', label: 'Содержание' } as any,
    heading: {
      type: 'aiText',
      label: 'Заголовок',
      fieldType: 'title',
      placeholder: 'Ввести текст...',
    } as any,
    headingSize: {
      type: 'select',
      label: 'Размер заголовка',
      options: [
        { label: 'Маленький', value: 'small' },
        { label: 'Средний', value: 'medium' },
        { label: 'Большой', value: 'large' },
      ],
    },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },
    // Hidden — нет в Figma 314-35069.
    headingAlignment: { type: 'hidden', label: '' },
    description: { type: 'hidden', label: '' },
    fields: { type: 'hidden', label: '' },
    buttonText: { type: 'hidden', label: '' },
  },
  defaults: {
    heading: 'Связаться с нами',
    description: 'Оставьте заявку — ответим в течение рабочего дня.',
    fields: {
      name: { enabled: true, required: true, label: 'Имя' },
      email: { enabled: true, required: true, label: 'Email' },
      phone: { enabled: false, required: false, label: 'Телефон' },
      message: { enabled: true, required: false, label: 'Сообщение' },
    },
    buttonText: 'Отправить',
    padding: { top: 80, bottom: 80 },
  },
  schema: ContactFormSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};

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
  heading: z.string(),
  description: z.string(),
  fields: z.object({
    name: FieldSchema,
    email: FieldSchema,
    phone: FieldSchema,
    message: FieldSchema,
  }),
  buttonText: z.string(),
  colorScheme: z.number().int().min(1).max(4),
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
    heading: { type: 'text', label: 'Заголовок' },
    description: { type: 'text', label: 'Описание' },
    fields: { type: 'object', label: 'Поля формы' },
    buttonText: { type: 'text', label: 'Кнопка' },
    colorScheme: { type: 'number', label: 'Цветовая схема' },
    padding: { type: 'object', label: 'Отступы' },
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
    colorScheme: 1,
    padding: { top: 80, bottom: 80 },
  },
  schema: ContactFormSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};

import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const MainTextSchema = z.object({
  heading: z.string(),
  text: z.string(),
  alignment: z.enum(['left', 'center', 'right']),
  headingSize: z.enum(['small', 'medium', 'large']).optional(),
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
  label: 'Основной текст',
  category: 'content',
  fields: {
    heading: { type: 'text', label: 'Заголовок' },
    text: { type: 'text', label: 'Текст' },
    alignment: { type: 'radio', label: 'Выравнивание' },
    headingSize: {
      type: 'radio',
      label: 'Размер заголовка',
      options: [
        { label: 'Маленький', value: 'small' },
        { label: 'Средний', value: 'medium' },
        { label: 'Большой', value: 'large' },
      ],
    },
    cta: { type: 'object', label: 'Кнопка (опционально)' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    heading: 'Заголовок раздела',
    text: 'Описание вашего магазина. Поддерживает базовое HTML-форматирование: <b>жирный</b> и <i>курсив</i>.',
    alignment: 'center',
    padding: { top: 80, bottom: 80 },
  },
  schema: MainTextSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};

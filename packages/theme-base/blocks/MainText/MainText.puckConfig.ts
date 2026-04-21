import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const MainTextSchema = z.object({
  heading: z.string(),
  text: z.string(),
  alignment: z.enum(['left', 'center', 'right']),
  colorScheme: z.number().int().min(1).max(4),
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
    colorScheme: { type: 'number', label: 'Цветовая схема' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    heading: 'Заголовок раздела',
    text: 'Описание вашего магазина. Поддерживает базовое HTML-форматирование: <b>жирный</b> и <i>курсив</i>.',
    alignment: 'center',
    colorScheme: 1,
    padding: { top: 80, bottom: 80 },
  },
  schema: MainTextSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};

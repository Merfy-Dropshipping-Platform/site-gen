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
  position: z.enum(['left', 'center', 'right']).optional(),
  headingSize: z.enum(['small', 'medium', 'large']).optional(),
  cta: z
    .object({
      text: z.string().optional(),
      href: z.string().optional(),
      link: z.string().optional(),
      variant: z.enum(['primary', 'black', 'white']).optional(),
    })
    .optional(),
  button: z.object({
    text: z.string().optional(),
    link: z.string().optional(),
  }).optional(),
  /**
   * 084 vanilla pilot — additive variant. Visual treatment of the CTA
   * button. `solid` (default) keeps pre-084 background+text variant
   * styling. `outlined` switches to a transparent button with current
   * border (vanilla home «Перейти в каталог»).
   */
  buttonStyle: z.enum(['solid', 'outlined']).optional(),
  /**
   * 084 vanilla pilot — additive variant. Controls italic/normal styling
   * for the body text. `normal` (default) preserves pre-084 text styling.
   * `italic` applies italic to the body content (vanilla home parity).
   */
  textStyle: z.enum(['normal', 'italic']).optional(),
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
    position: { type: 'alignment', label: 'Позиция' },
    alignment: {
      type: 'alignment',
      label: 'Выравнивание',
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
    cta: {
      type: 'object',
      label: 'Кнопка (опционально)',
      objectFields: {
        text: { type: 'text', label: 'Текст кнопки' },
        href: { type: 'pagePicker', label: 'Ссылка' },
        variant: {
          type: 'radio',
          label: 'Стиль',
          options: [
            { label: 'Акцент', value: 'primary' },
            { label: 'Чёрная', value: 'black' },
            { label: 'Белая', value: 'white' },
          ],
        },
      },
    },
    buttonStyle: {
      type: 'radio',
      label: 'Стиль кнопки',
      options: [
        { label: 'Заливка', value: 'solid' },
        { label: 'Контурная', value: 'outlined' },
      ],
    },
    textStyle: {
      type: 'radio',
      label: 'Стиль текста',
      options: [
        { label: 'Обычный', value: 'normal' },
        { label: 'Курсив', value: 'italic' },
      ],
    },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },
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

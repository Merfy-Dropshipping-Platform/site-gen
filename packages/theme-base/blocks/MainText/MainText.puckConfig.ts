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
  // Figma 314-34750: 4 sections — Содержание (header) / Позиция / Выравнивание /
  // Цветовая схема / Отступы. heading / text / button — в sub-panels через
  // subsection click в превью.
  fields: {
    ['_contentSection' as never]: { type: 'section-header', label: 'Содержание' } as any,
    position: {
      type: 'select',
      label: 'Позиция',
      options: [
        { label: 'Слева', value: 'left' },
        { label: 'По центру', value: 'center' },
        { label: 'Справа', value: 'right' },
      ],
    },
    alignment: { type: 'alignment', label: 'Выравнивание' },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },

    // Sub-panels — открываются subsection click в превью (NamedFocusedPanel).
    heading: {
      type: 'object',
      label: 'Заголовок',
      hiddenInMainPanel: true,
      objectFields: {
        text: { type: 'aiText', label: 'Заголовок', fieldType: 'title', placeholder: 'Ввести текст...' } as any,
        size: {
          type: 'select',
          label: 'Размер заголовка',
          options: [
            { label: 'Маленький', value: 'small' },
            { label: 'Средний', value: 'medium' },
            { label: 'Большой', value: 'large' },
          ],
        },
      },
    } as any,
    text: {
      type: 'object',
      label: 'Текст',
      hiddenInMainPanel: true,
      objectFields: {
        content: { type: 'aiText', label: 'Текст', fieldType: 'description', placeholder: 'Ввести текст...' } as any,
        size: {
          type: 'select',
          label: 'Размер текста',
          options: [
            { label: 'Маленький', value: 'small' },
            { label: 'Средний', value: 'medium' },
            { label: 'Большой', value: 'large' },
          ],
        },
      },
    } as any,
    button: {
      type: 'object',
      label: 'Кнопка',
      hiddenInMainPanel: true,
      objectFields: {
        text: { type: 'text', label: 'Текст' },
        link: { type: 'pagePicker', label: 'Ссылка' },
      },
    } as any,

    // Hidden — нет в Figma 314-34750.
    headingSize: { type: 'hidden', label: '' },
    cta: { type: 'hidden', label: '' },
    buttonStyle: { type: 'hidden', label: '' },
    textStyle: { type: 'hidden', label: '' },
  },
  defaults: {
    heading: 'Заголовок раздела',
    text: 'Описание вашего магазина. Поддерживает базовое HTML-форматирование: <b>жирный</b> и <i>курсив</i>.',
    alignment: 'center',
    headingSize: 'medium',
    textSize: 'medium',
    padding: { top: 80, bottom: 80 },
  },
  schema: MainTextSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};

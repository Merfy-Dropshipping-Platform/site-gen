import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const ImageWithTextSchema = z.object({
  image: z.object({ url: z.string(), alt: z.string() }),
  heading: z.union([
    z.string(),
    z.object({
      text: z.string().optional(),
      alignment: z.enum(['left', 'center', 'right']).optional(),
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
  button: z.object({
    text: z.string().optional(),
    href: z.string().optional(),
    link: z.string().optional(),
  }).optional(),
  imagePosition: z.enum(['left', 'right']).optional(),
  // Bug-2: выравнивание вынесено на уровень секции (Figma 1:17086). Применяется
  // к заголовку + тексту + кнопке. heading.alignment ниже остаётся для back-compat
  // (старые данные), но в UI больше не показывается.
  alignment: z.enum(['left', 'center', 'right']).optional(),
  /**
   * 084 vanilla pilot — additive variant. CTA placement within the text
   * column. `inline` (default) keeps the pre-084 inline button. `bottom-pinned`
   * pushes the button to the bottom of the column via `mt-auto` so it
   * aligns with the bottom edge of the image (Vanilla home parity).
   */
  ctaPosition: z.enum(['inline', 'bottom-pinned']).optional(),
  /**
   * 084 vanilla pilot Stage 2 Task 8 — additive variant. Controls italic
   * vs normal styling of heading + body. `normal` (default) preserves
   * pre-084 styling. `italic` applies italic to both (vanilla Figma
   * 1:18992 demands Bitter Italic + Arsenal Italic).
   */
  textStyle: z.enum(['normal', 'italic']).optional(),
  // Pupa parity.
  size: z.enum(['small', 'medium', 'large']).optional(),
  width: z.enum(['small', 'medium', 'large', 'full']).optional(),
  colorScheme: z.string().optional(),
  containerColorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type ImageWithTextProps = z.infer<typeof ImageWithTextSchema>;

export const ImageWithTextPuckConfig: BlockPuckConfig<ImageWithTextProps> = {
  label: 'Изображение с текстом',
  category: 'content',
  // Figma 314-34786: Изображения / Размер / Ширина / Позиция фото /
  // Цветовая схема / Отступы. Заголовок / Текст / Кнопка — sub-panels.
  fields: {
    image: {
      type: 'object',
      label: 'Изображения',
      objectFields: {
        url: { type: 'image', label: 'Фото' },
        // alt-текст убран из сайдбара (по требованию тестера). Поле скрыто,
        // значение image.alt сохраняется в схеме для совместимости/SEO рендера.
        alt: { type: 'hidden', label: '' },
      },
    },
    size: {
      type: 'select',
      label: 'Размер',
      options: [
        { label: 'Маленький', value: 'small' },
        { label: 'Средний', value: 'medium' },
        { label: 'Большой', value: 'large' },
      ],
    },
    width: {
      type: 'select',
      label: 'Ширина',
      options: [
        { label: 'Маленькая', value: 'small' },
        { label: 'Средняя', value: 'medium' },
        { label: 'Большая', value: 'large' },
      ],
    },
    imagePosition: {
      type: 'radio',
      label: 'Позиция фото',
      options: [
        { label: 'Слева', value: 'left' },
        { label: 'Справа', value: 'right' },
      ],
    },
    // Bug-2: «Выравнивание» отдельной строкой секции между «Позиция фото» и
    // «Цветовая схема» (Figma 1:17086). Применяется к заголовку/тексту/кнопке.
    alignment: { type: 'alignment', label: 'Выравнивание' },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },
    // Sub-panels (subsection click, NamedFocusedPanel):
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
    // Hidden — нет в Figma 314-34786.
    ctaPosition: { type: 'hidden', label: '' },
    textStyle: { type: 'hidden', label: '' },
    containerColorScheme: { type: 'hidden', label: '' },
  },
  defaults: {
    image: { url: '', alt: '' },
    heading: 'Изображение с текстом',
    text: 'Покажи и расскажи о своем товаре в одном блоке',
    button: { text: 'Кнопка', href: '/about' },
    imagePosition: 'left',
    padding: { top: 80, bottom: 80 },
  },
  schema: ImageWithTextSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};

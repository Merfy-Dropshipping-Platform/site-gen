import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

// КОНТРОЛЫ (fields / schema / label / category) = КАНОН
// packages/theme-base/blocks/ImageWithText/ImageWithText.puckConfig.ts —
// inline-копия (НЕ cross-package import, чтобы compile-astro-blocks.mjs не падал).
// defaults — satin'овские (манера темы): см. объект defaults ниже.
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
  /**
   * Field-order 24.09 — порядок drag-n-drop заголовка/текста/кнопки (канон
   * packages/theme-base/blocks/ImageWithText/ImageWithText.puckConfig.ts).
   */
  fieldOrder: z.array(z.string()).optional(),
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
    // Field-order 24.09: включает ручку drag-n-drop заголовка/текста/кнопки в
    // дереве конструктора. Значение пишет конструктор — `defaults` не задаём.
    fieldOrder: { type: 'hidden', label: '' },
  },
  // defaults — МАНЕРА satin (НЕ канон-дефолты): материалы-заголовок, портретный
  // Figma 1:19335 — плейсхолдер пустого состояния (картинка пустая → landscape-плейсхолдер).
  defaults: {
    image: {
      url: '',
      alt: '',
    },
    heading: 'Изображение с текстом',
    text: 'Покажи и расскажи о своем товаре в одном блоке',
    button: { text: 'Кнопка', href: '/about' },
    imagePosition: 'left',
    // 80/80 снят: инлайн-стиль отступа ПЕРЕБИВАЕТ классную лесенку порта
    // (замер рендером: с пропом `style="padding-top:80px"`, без пропа —
    // стиля нет и работают классы темы: rose 56→140px, vanilla 80→112,
    // flux 40→64, satin 32→56, bloom 80→120). Дефолт панели не «подсказка»:
    // updateProp вписывает его в секцию при ЛЮБОЙ правке, поэтому все пять
    // тем сплющивало в одинаковые 80/80. Отсутствие значения = ритм темы;
    // panel-field-defaults держит для `padding` явное исключение с причиной.
    // Контролы сайдбара обязаны стоять на том, что порт satin рисует БЕЗ
    // значения (снято рендером: без пропа и с этим значением HTML совпадает).
    alignment: 'center',
    size: 'medium',
    // «Ширина» НЕ задаём: без значения порт даёт max-w-[1920px] (полотно), а
    // список предлагает только 780/1080/1320 — точного совпадения нет.
  },
  schema: ImageWithTextSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};

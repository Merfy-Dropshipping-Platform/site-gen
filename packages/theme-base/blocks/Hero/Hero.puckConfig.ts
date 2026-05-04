import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

/**
 * Hero block — supports 4 variants:
 *   - centered  — single bg image + centered text (default)
 *   - split     — side-by-side image + text
 *   - overlay   — fullbleed bg image + overlay + centered text
 *   - grid-4    — 2x2 image grid + centered text (Rose-style collage)
 *
 * `image` is the canonical single-image shape (used by centered/split/overlay).
 * `images` is an optional array (4 items used by grid-4; falls back to repeating `image`).
 */
export const HeroSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  image: z.object({ url: z.string(), alt: z.string() }),
  images: z.array(z.object({ url: z.string(), alt: z.string() })).max(8).optional(),
  cta: z.object({ text: z.string(), href: z.string() }),
  variant: z.enum(['centered', 'split', 'overlay', 'grid-4']),
  // Pupa parity: nested heading/text + primary/secondary buttons + extended position.
  heading: z.object({
    text: z.string(),
    size: z.enum(['small', 'medium', 'large']),
  }).optional(),
  text: z.object({
    content: z.string(),
    size: z.enum(['small', 'medium', 'large']),
  }).optional(),
  primaryButton: z.object({
    text: z.string(),
    link: z.string(),
  }).optional(),
  secondaryButton: z.object({
    text: z.string(),
    link: z.string(),
  }).optional(),
  contentPosition: z.enum([
    'center',
    'top-left', 'top-center', 'top-right',
    'center-left', 'center-right',
    'bottom-left', 'bottom-center', 'bottom-right',
  ]).optional(),
  position: z.enum([
    'center',
    'top-left', 'top-center', 'top-right',
    'center-left', 'center-right',
    'bottom-left', 'bottom-center', 'bottom-right',
  ]).optional(),
  backgroundImage: z.string().optional(),
  backgroundImage2: z.string().optional(),
  backgroundImages: z.object({
    url1: z.string().optional(),
    url2: z.string().optional(),
  }).optional(),
  size: z.enum(['small', 'medium', 'large']).optional(),
  overlay: z.number().int().min(0).max(100).optional(),
  alignment: z.enum(['left', 'center', 'right']).optional(),
  container: z.enum(['true', 'false']).optional(),
  colorScheme: z.string().optional(),
  // 084 vanilla pilot — additive carousel mode. Default 'single' preserves
  // pre-edit rose render byte-for-byte. 'carousel' enables slides[] +
  // pagination + autoplay (ported from Slideshow block).
  mode: z.enum(['single', 'carousel']).optional(),
  slides: z.array(z.object({
    id: z.string(),
    imageUrl: z.string(),
    heading: z.object({
      text: z.string(),
      size: z.enum(['small', 'medium', 'large']),
    }).optional(),
    text: z.object({
      content: z.string(),
      size: z.enum(['small', 'medium', 'large']),
    }).optional(),
    buttonText: z.string().optional(),
    buttonLink: z.string().optional(),
    alignment: z.enum(['left', 'center', 'right']).optional(),
  })).max(8).optional(),
  pagination: z.enum(['numbers', 'dots', 'lines', 'none']).optional(),
  autoplay: z.boolean().optional(),
  interval: z.number().int().min(1).max(60).optional(),
  imageFullBleed: z.boolean().optional(),
  contentAlign: z.enum(['center', 'left']).optional(),
  buttonStyle: z.enum(['solid', 'outlined']).optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type HeroProps = z.infer<typeof HeroSchema>;

export const HeroPuckConfig: BlockPuckConfig<HeroProps> = {
  label: 'Изображение',
  category: 'hero',
  fields: {
    variant: {
      type: 'radio',
      label: 'Вариант',
      options: [
        { label: 'По центру', value: 'centered' },
        { label: 'Сплит (фото сбоку)', value: 'split' },
        { label: 'Фон на всю ширину', value: 'overlay' },
        { label: 'Сетка 2x2', value: 'grid-4' },
      ],
    },
    contentPosition: {
      type: 'select',
      label: 'Положение текста',
      options: [
        { label: 'Сверху слева', value: 'top-left' },
        { label: 'Сверху в центре', value: 'top-center' },
        { label: 'Сверху справа', value: 'top-right' },
        { label: 'По центру слева', value: 'center-left' },
        { label: 'По центру', value: 'center' },
        { label: 'По центру справа', value: 'center-right' },
        { label: 'Снизу слева', value: 'bottom-left' },
        { label: 'Снизу по центру', value: 'bottom-center' },
        { label: 'Снизу справа', value: 'bottom-right' },
      ],
    },
    position: {
      type: 'select',
      label: 'Позиция',
      options: [
        { label: 'Сверху слева', value: 'top-left' },
        { label: 'Сверху в центре', value: 'top-center' },
        { label: 'Сверху справа', value: 'top-right' },
        { label: 'По центру слева', value: 'center-left' },
        { label: 'По центру', value: 'center' },
        { label: 'По центру справа', value: 'center-right' },
        { label: 'Снизу слева', value: 'bottom-left' },
        { label: 'Снизу по центру', value: 'bottom-center' },
        { label: 'Снизу справа', value: 'bottom-right' },
      ],
    },
    backgroundImages: { type: 'imagePair', label: 'Фоновые изображения' } as any,
    backgroundImage: { type: 'image', label: 'Фоновое изображение (legacy)' },
    backgroundImage2: { type: 'image', label: 'Фоновое изображение 2 (legacy)' },
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
    primaryButton: {
      type: 'object',
      label: 'Кнопка основная',
      objectFields: {
        text: { type: 'text', label: 'Текст' },
        link: { type: 'pagePicker', label: 'Ссылка' },
      },
    },
    secondaryButton: {
      type: 'object',
      label: 'Кнопка вторичная',
      objectFields: {
        text: { type: 'text', label: 'Текст' },
        link: { type: 'pagePicker', label: 'Ссылка' },
      },
    },
    title: { type: 'text', label: 'Заголовок' },
    subtitle: { type: 'text', label: 'Подзаголовок' },
    image: {
      type: 'object',
      label: 'Изображение',
      objectFields: {
        url: { type: 'image', label: 'Фото' },
        alt: { type: 'text', label: 'Alt текст' },
      },
    },
    images: {
      type: 'array',
      label: 'Сетка изображений (grid-4)',
      arrayFields: {
        url: { type: 'image', label: 'Фото' },
        alt: { type: 'text', label: 'Alt текст' },
      },
      defaultItemProps: { url: '', alt: '' },
      max: 8,
    },
    cta: {
      type: 'object',
      label: 'Кнопка',
      objectFields: {
        text: { type: 'text', label: 'Текст' },
        href: { type: 'text', label: 'Ссылка' },
      },
    },
    // Pupa parity: дополнительные параметры секции.
    size: {
      type: 'radio',
      label: 'Размер',
      options: [
        { label: 'Маленький', value: 'small' },
        { label: 'Средний', value: 'medium' },
        { label: 'Большой', value: 'large' },
      ],
    },
    overlay: { type: 'slider', label: 'Затемнение', min: 0, max: 100, step: 5 },
    alignment: { type: 'alignment', label: 'Выравнивание' },
    container: {
      type: 'radio',
      label: 'Контейнер',
      options: [
        { label: 'Показать', value: 'true' },
        { label: 'Скрыть', value: 'false' },
      ],
    },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    // 084 vanilla pilot — additive carousel mode fields. Optional in schema —
    // if absent, theme renders 'single' mode (current rose behaviour).
    mode: {
      type: 'radio',
      label: 'Режим',
      options: [
        { label: 'Одиночный', value: 'single' },
        { label: 'Карусель', value: 'carousel' },
      ],
    },
    slides: {
      type: 'array',
      label: 'Слайды (карусель)',
      arrayFields: {
        id: { type: 'text', label: 'ID' },
        imageUrl: { type: 'image', label: 'Фото' },
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
        buttonText: { type: 'text', label: 'Текст кнопки' },
        buttonLink: { type: 'pagePicker', label: 'Ссылка кнопки' },
        alignment: { type: 'alignment', label: 'Выравнивание' },
      },
      defaultItemProps: { id: '', imageUrl: '' },
      max: 8,
    },
    pagination: {
      type: 'radio',
      label: 'Пагинация',
      options: [
        { label: 'Цифры', value: 'numbers' },
        { label: 'Точки', value: 'dots' },
        { label: 'Линии', value: 'lines' },
        { label: 'Скрыть', value: 'none' },
      ],
    },
    autoplay: { type: 'radio', label: 'Автопрокрутка', options: [
      { label: 'Вкл', value: true },
      { label: 'Выкл', value: false },
    ] },
    interval: { type: 'number', label: 'Интервал (сек)', min: 1, max: 60 },
    imageFullBleed: { type: 'radio', label: 'Фото на всю ширину', options: [
      { label: 'Да', value: true },
      { label: 'Нет', value: false },
    ] },
    contentAlign: {
      type: 'radio',
      label: 'Выравнивание контента',
      options: [
        { label: 'По центру', value: 'center' },
        { label: 'Слева', value: 'left' },
      ],
    },
    buttonStyle: {
      type: 'radio',
      label: 'Стиль кнопки',
      options: [
        { label: 'Заливка', value: 'solid' },
        { label: 'Контур', value: 'outlined' },
      ],
    },
    padding: {
      type: 'object',
      label: 'Отступы',
      objectFields: {
        top: { type: 'number', label: 'Сверху (px)', min: 0, max: 160 },
        bottom: { type: 'number', label: 'Снизу (px)', min: 0, max: 160 },
      },
    },
  },
  defaults: {
    title: 'Добро пожаловать',
    subtitle: '',
    image: { url: '', alt: '' },
    images: undefined,
    cta: { text: 'Смотреть каталог', href: '/catalog' },
    variant: 'centered',
    contentPosition: 'center',
    padding: { top: 80, bottom: 80 },
  },
  schema: HeroSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};

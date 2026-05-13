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
  // Принимаем обе формы: string (legacy / Pupa shape, как в существующих
  // ревизиях `image: "/main-image.png"`) или object (новый Theme Contract).
  // Hero.astro нормализует оба варианта.
  image: z.union([z.string(), z.object({ url: z.string(), alt: z.string() })]).optional(),
  images: z.array(z.object({ url: z.string(), alt: z.string() })).max(8).optional(),
  cta: z.object({ text: z.string(), href: z.string() }),
  variant: z.enum(['centered', 'split', 'overlay', 'grid-4', 'split-bloom']),
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
  // 091-merge: Hero ↔ ImageWithText sidebar по Figma 314-34786.
  width: z.enum(['small', 'medium', 'large']).optional(),
  photoPosition: z.enum(['left', 'right']).optional(),
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
  label: 'Изображение с текстом',
  category: 'hero',
  fields: {
    // 091-merge: 6 видимых полей по Figma 314-34786.
    // Все остальные legacy-поля — `hidden`. Данные сохраняются, рендер
    // (Hero.astro) использует их по-прежнему, но мерчант их не редактирует.
    //
    // image — `type: image` (single URL string), а не object. Старые
    // ревизии хранят `image: "/main-image.png"` строкой; Hero.astro
    // принимает обе формы. При object Puck Editor сбрасывал данные при
    // смежных изменениях полей.
    image: { type: 'image', label: 'Изображения' } as any,
    // Legacy hidden — заменены single `image`.
    variant: { type: 'hidden', label: '' },
    contentPosition: { type: 'hidden', label: '' } as any,
    position: { type: 'hidden', label: '' },
    backgroundImages: { type: 'hidden', label: '' } as any,
    backgroundImage: { type: 'hidden', label: '' },
    backgroundImage2: { type: 'hidden', label: '' },
    // heading / text / primaryButton / secondaryButton — видны только в
    // sub-panel'е при click на subsection в превью (NamedFocusedPanel).
    // hiddenInMainPanel=true → CustomFieldsPanel dynamic renderer пропускает
    // в main panel, но field config остаётся валидным для sub-panel.
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
    primaryButton: {
      type: 'object',
      label: 'Кнопка основная',
      hiddenInMainPanel: true,
      objectFields: {
        text: { type: 'text', label: 'Текст' },
        link: { type: 'pagePicker', label: 'Ссылка' },
      },
    } as any,
    secondaryButton: {
      type: 'object',
      label: 'Кнопка вторичная',
      hiddenInMainPanel: true,
      objectFields: {
        text: { type: 'text', label: 'Текст' },
        link: { type: 'pagePicker', label: 'Ссылка' },
      },
    } as any,
    // Legacy fields — скрыты, заменены на heading / text / backgroundImages /
    // primaryButton. Данные сохраняются 1-в-1 (backward-compat при rollback).
    title: { type: 'hidden', label: '' },
    subtitle: { type: 'hidden', label: '' },
    images: { type: 'hidden', label: '' },
    cta: { type: 'hidden', label: '' },
    // Figma 314-34786 поля.
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
    photoPosition: {
      type: 'radio',
      label: 'Позиция фото',
      options: [
        { label: 'Слева', value: 'left' },
        { label: 'Справа', value: 'right' },
      ],
    },
    // Legacy hidden — после merge не редактируются.
    overlay: { type: 'hidden', label: '' },
    alignment: { type: 'hidden', label: '' },
    container: { type: 'hidden', label: '' },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    // Carousel mode + slides — advanced, скрыты по умолчанию в sidebar.
    // Theme rendering обрабатывает existing data normally если есть, но
    // редактирование slides убрано чтобы не загромождать sidebar.
    mode: { type: 'hidden', label: '' },
    slides: {
      type: 'hidden',
      label: 'Слайды (карусель)',
      arrayFields: {
        id: { type: 'text', label: 'ID' },
        imageUrl: { type: 'image', label: 'Фото' },
        heading: {
          type: 'object',
          label: 'Заголовок',
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
        },
        text: {
          type: 'object',
          label: 'Текст',
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
        },
        buttonText: { type: 'text', label: 'Текст кнопки' },
        buttonLink: { type: 'pagePicker', label: 'Ссылка кнопки' },
        alignment: { type: 'alignment', label: 'Выравнивание' },
      },
      defaultItemProps: { id: '', imageUrl: '' },
      max: 8,
    },
    pagination: { type: 'hidden', label: '' },
    autoplay: { type: 'hidden', label: '' },
    interval: { type: 'hidden', label: '' },
    // Legacy hidden — после merge не редактируются.
    imageFullBleed: { type: 'hidden', label: '' },
    contentAlign: { type: 'hidden', label: '' },
    buttonStyle: { type: 'hidden', label: '' },
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
    image: '',
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

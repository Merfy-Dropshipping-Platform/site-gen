import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

// Bloom Hero override.
// Same prop SHAPE as @merfy/theme-base/blocks/Hero (schema duplicated here
// because value imports from @merfy/theme-base don't resolve in compiled
// flat dist/ layout — see scripts/compile-astro-blocks.mjs).
// Pixel-matched to Figma 669:15290 ("Фото & Текст" / Bloom hero split).

export const HeroSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  image: z.object({ url: z.string(), alt: z.string() }),
  images: z.array(z.object({ url: z.string(), alt: z.string() })).max(8).optional(),
  cta: z.object({ text: z.string(), href: z.string() }),
  variant: z.enum(['centered', 'split', 'overlay', 'grid-4']),
  colorScheme: z.string().optional(),
  // Pupa parity (nested + extended).
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
  contentPosition: z.enum([
    'center',
    'top-left', 'top-center', 'top-right',
    'center-left', 'center-right',
    'bottom-left', 'bottom-center', 'bottom-right',
  ]).optional(),
  padding: z.object({
    top: z.number().int().min(0).max(200),
    bottom: z.number().int().min(0).max(200),
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
        { label: 'Сплит (фото сбоку)', value: 'split' },
        { label: 'По центру', value: 'centered' },
        { label: 'Фон на всю ширину', value: 'overlay' },
        { label: 'Сетка 2x2', value: 'grid-4' },
      ],
    },
    title: { type: 'text', label: 'Заголовок (акцент)' },
    subtitle: { type: 'textarea', label: 'Подзаголовок (описание)' },
    image: {
      type: 'object',
      label: 'Изображение',
      objectFields: {
        url: { type: 'image', label: 'Загрузить фото' },
        alt: { type: 'text', label: 'Alt текст (для SEO)' },
      },
    },
    images: {
      type: 'array',
      label: 'Сетка изображений (grid-4)',
      arrayFields: {
        url: { type: 'image', label: 'Загрузить фото' },
        alt: { type: 'text', label: 'Alt текст' },
      },
      defaultItemProps: { url: '', alt: '' },
      max: 8,
    },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    cta: {
      type: 'object',
      label: 'Кнопка',
      objectFields: {
        text: { type: 'text', label: 'Текст' },
        href: { type: 'text', label: 'Ссылка' },
      },
    },
    heading: {
      type: 'object',
      label: 'Заголовок (pupa)',
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
      label: 'Текст (pupa)',
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
    backgroundImages: { type: 'imagePair', label: 'Фоновые изображения' } as any,
    backgroundImage: { type: 'image', label: 'Фоновое изображение (legacy)' },
    backgroundImage2: { type: 'image', label: 'Фоновое изображение 2 (legacy)' },
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
    contentPosition: {
      type: 'radio',
      label: 'Положение текста',
      options: [
        { label: 'По центру', value: 'center' },
        { label: 'Снизу-слева', value: 'bottom-left' },
        { label: 'Снизу-по-центру', value: 'bottom-center' },
        { label: 'Снизу-справа', value: 'bottom-right' },
      ],
    },
    padding: { type: 'padding', label: 'Отступы' },
  },
  defaults: {
    title: 'ИСКУССТВО ЗАБОТЫ О СЕБЕ',
    subtitle:
      'Уходовая косметика, которая дарит здоровье и сияние твоей коже и волосам',
    image: { url: '/main-image.png', alt: 'Bloom hero' },
    images: undefined,
    cta: { text: 'Начать ритуал', href: '/catalog' },
    variant: 'split',
    padding: { top: 0, bottom: 0 },
  },
  schema: HeroSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 200, step: 8 } },
};

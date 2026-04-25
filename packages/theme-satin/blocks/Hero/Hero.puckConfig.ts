import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

// Satin Hero override.
// Same prop SHAPE as @merfy/theme-base/blocks/Hero (schema duplicated here
// because value imports from @merfy/theme-base don't resolve in compiled
// flat dist/ layout — see scripts/compile-astro-blocks.mjs).
// Pixel-matched to Figma 681:11674 (Hero Satin Deckstop).

export const HeroSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  image: z.object({ url: z.string(), alt: z.string() }),
  images: z.array(z.object({ url: z.string(), alt: z.string() })).max(8).optional(),
  cta: z.object({ text: z.string(), href: z.string() }),
  variant: z.enum(['centered', 'split', 'overlay', 'grid-4']),
  // Pupa parity.
  size: z.enum(['small', 'medium', 'large']).optional(),
  overlay: z.number().int().min(0).max(100).optional(),
  alignment: z.enum(['left', 'center', 'right']).optional(),
  container: z.enum(['true', 'false']).optional(),
  contentPosition: z.enum(['center', 'bottom-left', 'bottom-center', 'bottom-right']).optional(),
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(200),
    bottom: z.number().int().min(0).max(200),
  }),
});

export type HeroProps = z.infer<typeof HeroSchema>;

export const HeroPuckConfig: BlockPuckConfig<HeroProps> = {
  label: 'Главный экран (Satin)',
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
    title: { type: 'textarea', label: 'Заголовок' },
    subtitle: { type: 'text', label: 'Подзаголовок (серый)' },
    image: {
      type: 'object',
      label: 'Изображение',
      objectFields: {
        url: { type: 'text', label: 'URL' },
        alt: { type: 'text', label: 'Alt текст' },
      },
    },
    images: {
      type: 'array',
      label: 'Сетка изображений (grid-4)',
      arrayFields: {
        url: { type: 'text', label: 'URL' },
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
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: {
      type: 'object',
      label: 'Отступы',
      objectFields: {
        top: { type: 'number', label: 'Сверху (px)', min: 0, max: 200 },
        bottom: { type: 'number', label: 'Снизу (px)', min: 0, max: 200 },
      },
    },
  },
  defaults: {
    title: "STYLE'S WEAR COLLECTION\nSINCE 90'",
    subtitle: 'Оставайтесь в центре внимания',
    image: {
      url: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=80',
      alt: 'Модель в платке',
    },
    images: undefined,
    cta: { text: 'Новые поступления', href: '/catalog' },
    variant: 'split',
    padding: { top: 0, bottom: 0 },
  },
  schema: HeroSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 200, step: 8 } },
};

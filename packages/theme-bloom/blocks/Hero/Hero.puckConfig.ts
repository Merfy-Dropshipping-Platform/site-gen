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
  padding: z.object({
    top: z.number().int().min(0).max(200),
    bottom: z.number().int().min(0).max(200),
  }),
});

export type HeroProps = z.infer<typeof HeroSchema>;

export const HeroPuckConfig: BlockPuckConfig<HeroProps> = {
  label: 'Главный экран (Bloom)',
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

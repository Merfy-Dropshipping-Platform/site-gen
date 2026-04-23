import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

const SlideSchema = z.object({
  id: z.string(),
  imageUrl: z.string(),
  heading: z.string(),
  subtitle: z.string(),
  ctaText: z.string(),
  ctaUrl: z.string(),
});

export const SlideshowSchema = z.object({
  slides: z.array(SlideSchema).min(1).max(5),
  interval: z.union([z.literal(3), z.literal(5), z.literal(7), z.literal(9)]),
  autoplay: z.boolean(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type SlideshowProps = z.infer<typeof SlideshowSchema>;

export const SlideshowPuckConfig: BlockPuckConfig<SlideshowProps> = {
  label: 'Слайд-шоу',
  category: 'hero',
  fields: {
    slides: { type: 'array', label: 'Слайды' },
    interval: { type: 'number', label: 'Интервал (сек)' },
    autoplay: { type: 'radio', label: 'Автопрокрутка' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    slides: [
      {
        id: 'slide-1',
        imageUrl: '',
        heading: 'Первый слайд',
        subtitle: 'Описание первого слайда',
        ctaText: 'Подробнее',
        ctaUrl: '/catalog',
      },
      {
        id: 'slide-2',
        imageUrl: '',
        heading: 'Второй слайд',
        subtitle: 'Описание второго слайда',
        ctaText: 'Смотреть',
        ctaUrl: '/catalog',
      },
      {
        id: 'slide-3',
        imageUrl: '',
        heading: 'Третий слайд',
        subtitle: 'Описание третьего слайда',
        ctaText: 'Купить',
        ctaUrl: '/catalog',
      },
    ],
    interval: 5,
    autoplay: true,
    padding: { top: 80, bottom: 80 },
  },
  schema: SlideshowSchema,
  maxInstances: null,
  constraints: {
    padding: { min: 0, max: 160, step: 8 },
    maxSlides: 5,
    intervals: [3, 5, 7, 9],
  },
};

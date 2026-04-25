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
  // Pupa parity.
  imagePosition: z.enum(['fullscreen', 'contained', 'left', 'right']).optional(),
  size: z.enum(['small', 'medium', 'large']).optional(),
  overlay: z.number().int().min(0).max(100).optional(),
  pagination: z.enum(['numbers', 'dots', 'lines', 'none']).optional(),
  colorScheme: z.string().optional(),
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
    slides: {
      type: 'array',
      label: 'Слайды (макс 5)',
      arrayFields: {
        imageUrl: { type: 'image', label: 'Изображение' },
        heading: { type: 'text', label: 'Заголовок' },
        subtitle: { type: 'textarea', label: 'Подзаголовок' },
        ctaText: { type: 'text', label: 'Текст кнопки' },
        ctaUrl: { type: 'text', label: 'Ссылка кнопки' },
      },
      defaultItemProps: { id: '', imageUrl: '', heading: 'Новый слайд', subtitle: '', ctaText: 'Подробнее', ctaUrl: '/catalog' },
      max: 5,
    },
    imagePosition: {
      type: 'radio',
      label: 'Положение изображения',
      options: [
        { label: 'Полноэкранное', value: 'fullscreen' },
        { label: 'Контейнер', value: 'contained' },
        { label: 'Слева', value: 'left' },
        { label: 'Справа', value: 'right' },
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
    interval: { type: 'slider', label: 'Интервал (сек)', min: 3, max: 9, step: 2 },
    overlay: { type: 'slider', label: 'Затемнение', min: 0, max: 100, step: 5 },
    pagination: {
      type: 'radio',
      label: 'Нумерация страниц',
      options: [
        { label: 'Цифры', value: 'numbers' },
        { label: 'Точки', value: 'dots' },
        { label: 'Линии', value: 'lines' },
        { label: 'Скрыть', value: 'none' },
      ],
    },
    autoplay: { type: 'radio', label: 'Автопрокрутка' },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },
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

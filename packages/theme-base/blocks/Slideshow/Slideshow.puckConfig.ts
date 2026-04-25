import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

const SlideSchema = z.object({
  id: z.string(),
  imageUrl: z.string(),
  heading: z.union([
    z.string(),
    z.object({
      text: z.string().optional(),
      size: z.enum(['small', 'medium', 'large']).optional(),
    }),
  ]).optional(),
  subtitle: z.string().optional(),
  text: z.object({
    content: z.string().optional(),
    size: z.enum(['small', 'medium', 'large']).optional(),
  }).optional(),
  ctaText: z.string().optional(),
  ctaUrl: z.string().optional(),
  button: z.object({
    text: z.string().optional(),
    link: z.string().optional(),
  }).optional(),
  // Pupa parity: per-slide layout + theme.
  image: z.string().optional(),
  container: z.enum(['true', 'false']).optional(),
  position: z.enum(['left', 'center', 'right']).optional(),
  alignment: z.enum(['left', 'center', 'right']).optional(),
  colorScheme: z.string().optional(),
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
        image: { type: 'image', label: 'Изображение (pupa)' },
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
        button: {
          type: 'object',
          label: 'Кнопка',
          objectFields: {
            text: { type: 'text', label: 'Текст' },
            link: { type: 'pagePicker', label: 'Ссылка' },
          },
        },
        container: {
          type: 'radio',
          label: 'Контейнер',
          options: [
            { label: 'Показать', value: 'true' },
            { label: 'Скрыть', value: 'false' },
          ],
        },
        position: {
          type: 'radio',
          label: 'Позиция',
          options: [
            { label: 'Слева', value: 'left' },
            { label: 'По центру', value: 'center' },
            { label: 'Справа', value: 'right' },
          ],
        },
        alignment: { type: 'alignment', label: 'Выравнивание' },
        colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
      },
      defaultItemProps: {
        id: '',
        imageUrl: '',
        heading: { text: 'Новый слайд', size: 'medium' },
        text: { content: '', size: 'medium' },
        button: { text: 'Подробнее', link: '/catalog' },
        container: 'true',
        position: 'center',
        alignment: 'center',
      },
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

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
  label: 'Изображение с текстом (Satin)',
  category: 'content',
  fields: {
    image: {
      type: 'object',
      label: 'Изображение',
      objectFields: {
        url: { type: 'text', label: 'URL' },
        alt: { type: 'text', label: 'Alt текст' },
      },
    },
    heading: {
      type: 'object',
      label: 'Заголовок',
      objectFields: {
        text: { type: 'text', label: 'Текст' },
        alignment: { type: 'alignment', label: 'Выравнивание' },
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
    imagePosition: {
      type: 'radio',
      label: 'Позиция фото',
      options: [
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
    width: {
      type: 'radio',
      label: 'Ширина',
      options: [
        { label: 'Маленькая', value: 'small' },
        { label: 'Средняя', value: 'medium' },
        { label: 'Большая', value: 'large' },
        { label: 'Во всю', value: 'full' },
      ],
    },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    containerColorScheme: { type: 'colorScheme', label: 'Цветовая схема контейнера' },
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
    image: {
      url: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=1200&q=80',
      alt: 'Satin коллекция',
    },
    heading: 'НАШИ МАТЕРИАЛЫ',
    text: 'Каждый элемент коллекции создан из тщательно отобранных натуральных тканей. Минимализм и элегантность — наши главные принципы.',
    button: { text: 'Подробнее', href: '/about' },
    imagePosition: 'left',
    padding: { top: 80, bottom: 80 },
  },
  schema: ImageWithTextSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};

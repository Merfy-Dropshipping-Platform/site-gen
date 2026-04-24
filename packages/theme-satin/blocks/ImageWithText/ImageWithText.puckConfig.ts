import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const ImageWithTextSchema = z.object({
  image: z.object({ url: z.string(), alt: z.string() }),
  heading: z.string(),
  text: z.string(),
  button: z.object({ text: z.string(), href: z.string() }),
  imagePosition: z.enum(['left', 'right']),
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
    heading: { type: 'text', label: 'Заголовок' },
    text: { type: 'textarea', label: 'Текст' },
    button: {
      type: 'object',
      label: 'Кнопка',
      objectFields: {
        text: { type: 'text', label: 'Текст' },
        href: { type: 'text', label: 'Ссылка' },
      },
    },
    imagePosition: {
      type: 'radio',
      label: 'Позиция изображения',
      options: [
        { label: 'Слева', value: 'left' },
        { label: 'Справа', value: 'right' },
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

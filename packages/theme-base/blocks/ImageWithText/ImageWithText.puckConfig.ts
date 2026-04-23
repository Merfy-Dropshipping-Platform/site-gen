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
  label: 'Изображение с текстом',
  category: 'content',
  fields: {
    image: { type: 'object', label: 'Изображение' },
    heading: { type: 'text', label: 'Заголовок' },
    text: { type: 'text', label: 'Текст' },
    button: { type: 'object', label: 'Кнопка' },
    imagePosition: { type: 'radio', label: 'Позиция изображения' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    image: { url: '', alt: '' },
    heading: 'Расскажите о товаре',
    text: 'Опишите преимущества продукта, его ценность для клиента.',
    button: { text: 'Подробнее', href: '/about' },
    imagePosition: 'left',
    padding: { top: 80, bottom: 80 },
  },
  schema: ImageWithTextSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};

import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

const GalleryItemSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('image'),
    id: z.string(),
    url: z.string(),
    alt: z.string(),
  }),
  z.object({
    type: z.literal('product'),
    id: z.string(),
    productId: z.string().nullable(),
  }),
  z.object({
    type: z.literal('collection'),
    id: z.string(),
    collectionId: z.string().nullable(),
  }),
]);

export const GallerySchema = z.object({
  heading: z.string().optional(),
  items: z.array(GalleryItemSchema).min(1).max(3),
  layout: z.enum(['grid', 'side-by-side']),
  colorScheme: z.number().int().min(1).max(4),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type GalleryProps = z.infer<typeof GallerySchema>;

export const GalleryPuckConfig: BlockPuckConfig<GalleryProps> = {
  label: 'Галерея',
  category: 'media',
  fields: {
    heading: { type: 'text', label: 'Заголовок' },
    items: { type: 'array', label: 'Элементы (макс 3)' },
    layout: { type: 'radio', label: 'Расположение' },
    colorScheme: { type: 'number', label: 'Цветовая схема' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    heading: '',
    items: [
      { type: 'image', id: 'item-1', url: '', alt: 'Image 1' },
      { type: 'image', id: 'item-2', url: '', alt: 'Image 2' },
      { type: 'image', id: 'item-3', url: '', alt: 'Image 3' },
    ],
    layout: 'grid',
    colorScheme: 1,
    padding: { top: 80, bottom: 80 },
  },
  schema: GallerySchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 }, maxItems: 3 },
};

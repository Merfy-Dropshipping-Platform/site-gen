import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

// Gallery item: image OR product OR collection picker. Stored as flat
// `type` + payload fields; merchant picks kind in constructor.
const GalleryItemSchema = z.object({
  id: z.string(),
  type: z.enum(['image', 'product', 'collection']),
  url: z.string().optional(),
  alt: z.string().optional(),
  productId: z.string().nullable().optional(),
  collectionId: z.string().nullable().optional(),
});

export const GallerySchema = z.object({
  heading: z.string().optional(),
  subheading: z.string().optional(),
  items: z.array(GalleryItemSchema).min(1).max(3),
  layout: z.enum(['grid', 'side-by-side', 'featured']),
  colorScheme: z.string().optional(),
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
    subheading: { type: 'textarea', label: 'Подзаголовок' },
    items: {
      type: 'array',
      label: 'Элементы (макс 3)',
      arrayFields: {
        type: {
          type: 'radio',
          label: 'Тип',
          options: [
            { label: 'Изображение', value: 'image' },
            { label: 'Товар', value: 'product' },
            { label: 'Коллекция', value: 'collection' },
          ],
        },
        url: { type: 'image', label: 'Изображение' },
        alt: { type: 'text', label: 'Alt текст' },
        productId: { type: 'productPicker', label: 'Товар' },
        collectionId: { type: 'collectionPicker', label: 'Коллекция' },
      },
      defaultItemProps: { id: '', type: 'image', url: '', alt: '' },
      max: 3,
    },
    layout: {
      type: 'radio',
      label: 'Расположение',
      options: [
        { label: 'Сетка', value: 'grid' },
        { label: 'Рядом (2 колонки)', value: 'side-by-side' },
        { label: 'Акцент + стопка', value: 'featured' },
      ],
    },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },
  },
  defaults: {
    heading: '',
    subheading: '',
    items: [
      { id: 'item-1', type: 'image', url: '', alt: 'Image 1' },
      { id: 'item-2', type: 'image', url: '', alt: 'Image 2' },
      { id: 'item-3', type: 'image', url: '', alt: 'Image 3' },
    ],
    layout: 'featured',
    padding: { top: 80, bottom: 80 },
  },
  schema: GallerySchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 }, maxItems: 3 },
};

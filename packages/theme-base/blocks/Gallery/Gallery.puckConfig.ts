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
  heading: z.union([
    z.string(),
    z.object({
      text: z.string().optional(),
      alignment: z.enum(['left', 'center', 'right']).optional(),
      size: z.enum(['small', 'medium', 'large']).optional(),
    }),
  ]).optional(),
  subheading: z.string().optional(),
  text: z.object({
    content: z.string().optional(),
    size: z.enum(['small', 'medium', 'large']).optional(),
  }).optional(),
  items: z.array(GalleryItemSchema).min(1).max(3),
  layout: z.enum(['grid', 'side-by-side', 'featured']),
  // Pupa parity.
  imagePosition: z.enum(['left', 'right']).optional(),
  headingAlignment: z.enum(['left', 'center', 'right']).optional(),
  headingSize: z.enum(['small', 'medium', 'large']).optional(),
  textSize: z.enum(['small', 'medium', 'large']).optional(),
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
  // Figma 314-34875: Содержание (header) / Заголовок (aiText) / Размер
  // заголовка / Текст (aiText) / Размер текста / Положение изображения /
  // Цветовая схема / Отступы.
  fields: {
    ['_contentSection' as never]: { type: 'section-header', label: 'Содержание' } as any,
    heading: {
      type: 'aiText',
      label: 'Заголовок',
      fieldType: 'title',
      placeholder: 'Ввести текст...',
    } as any,
    headingSize: {
      type: 'select',
      label: 'Размер заголовка',
      options: [
        { label: 'Маленький', value: 'small' },
        { label: 'Средний', value: 'medium' },
        { label: 'Большой', value: 'large' },
      ],
    },
    text: {
      type: 'aiText',
      label: 'Текст',
      fieldType: 'description',
      placeholder: 'Ввести текст...',
    } as any,
    textSize: {
      type: 'select',
      label: 'Размер текста',
      options: [
        { label: 'Маленький', value: 'small' },
        { label: 'Средний', value: 'medium' },
        { label: 'Большой', value: 'large' },
      ],
    },
    imagePosition: {
      type: 'radio',
      label: 'Положение изображения',
      options: [
        { label: 'Слева', value: 'left' },
        { label: 'Справа', value: 'right' },
      ],
    },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },
    // Items — sub-panel array, редактирование через subsection click.
    items: {
      type: 'array',
      label: 'Элементы (макс 3)',
      hiddenInMainPanel: true,
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
        // alt-текст убран из сайдбара Галереи (по требованию тестера). Значение
        // item.alt сохраняется в схеме для рендера <img alt> (SEO).
        alt: { type: 'hidden', label: '' },
        productId: { type: 'productPicker', label: 'Товар' },
        collectionId: { type: 'collectionPicker', label: 'Коллекция' },
      },
      defaultItemProps: { id: '', type: 'image', url: '', alt: '' },
      max: 3,
    } as any,
    // Hidden — нет в Figma 314-34875.
    layout: { type: 'hidden', label: '' },
    headingAlignment: { type: 'hidden', label: '' },
    subheading: { type: 'hidden', label: '' },
  },
  defaults: {
    heading: '',
    subheading: '',
    items: [
      { id: 'item-1', type: 'image', url: '', alt: 'Изображение' },
      { id: 'item-2', type: 'product', productId: null },
      { id: 'item-3', type: 'collection', collectionId: null },
    ],
    layout: 'featured',
    imagePosition: 'left',
    headingSize: 'medium',
    textSize: 'medium',
    padding: { top: 80, bottom: 80 },
  },
  schema: GallerySchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 }, maxItems: 3 },
};

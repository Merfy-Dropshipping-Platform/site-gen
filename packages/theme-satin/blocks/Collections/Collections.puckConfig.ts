import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

// Satin Collections — same prop shape as base. Defaults adapted for Satin
// editorial mood (empty heading, 40px padding, 3 portrait cards with
// Satin-style clothing-category labels).

const CollectionItemSchema = z.object({
  id: z.string(),
  collectionId: z.string().nullable(),
  heading: z.string(),
  description: z.string().optional(),
  image: z.string().optional(),
});

export const CollectionsSchema = z.object({
  heading: z.string(),
  // Pupa parity.
  titleAlignment: z.enum(['left', 'center', 'right']).optional(),
  headingSize: z.enum(['small', 'medium', 'large']).optional(),
  subtitle: z.string().optional(),
  subtitleSize: z.enum(['small', 'medium', 'large']).optional(),
  imageView: z.enum(['square', 'portrait', 'wide']).optional(),
  colorScheme: z.string().optional(),
  collections: z.array(CollectionItemSchema).min(1).max(10),
  columns: z.number().int().min(1).max(6),
  padding: z.object({
    top: z.number().int().min(0).max(200),
    bottom: z.number().int().min(0).max(200),
  }),
});

export type CollectionsProps = z.infer<typeof CollectionsSchema>;

export const CollectionsPuckConfig: BlockPuckConfig<CollectionsProps> = {
  label: 'Список коллекций (Satin)',
  category: 'products',
  fields: {
    heading: { type: 'text', label: 'Заголовок (опционально)' },
    titleAlignment: { type: 'alignment', label: 'Выравнивание заголовка' },
    headingSize: {
      type: 'radio',
      label: 'Размер заголовка',
      options: [
        { label: 'Маленький', value: 'small' },
        { label: 'Средний', value: 'medium' },
        { label: 'Большой', value: 'large' },
      ],
    },
    subtitle: { type: 'text', label: 'Подзаголовок' },
    subtitleSize: {
      type: 'radio',
      label: 'Размер подзаголовка',
      options: [
        { label: 'Маленький', value: 'small' },
        { label: 'Средний', value: 'medium' },
        { label: 'Большой', value: 'large' },
      ],
    },
    imageView: {
      type: 'radio',
      label: 'Вид изображения',
      options: [
        { label: 'Квадрат', value: 'square' },
        { label: 'Портрет', value: 'portrait' },
        { label: 'Широкая', value: 'wide' },
      ],
    },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    collections: {
      type: 'array',
      label: 'Коллекции',
      arrayFields: {
        id: { type: 'text', label: 'ID' },
        collectionId: { type: 'text', label: 'ID коллекции (в каталоге)' },
        heading: { type: 'text', label: 'Название' },
        description: { type: 'text', label: 'Описание' },
        image: { type: 'text', label: 'URL изображения' },
      },
      defaultItemProps: { id: 'col-new', collectionId: null, heading: 'Новая коллекция', description: '', image: '' },
      max: 10,
    },
    columns: {
      type: 'radio',
      label: 'Колонок',
      options: [
        { label: '2', value: 2 },
        { label: '3', value: 3 },
        { label: '4', value: 4 },
      ],
    },
    padding: {
      type: 'object',
      label: 'Отступы',
      objectFields: {
        top: { type: 'number', label: 'Сверху (px)', min: 0, max: 200 },
        bottom: { type: 'number', label: 'Снизу (px)', min: 0, max: 200 },
      },
    },
  },
  defaults: {
    heading: '',
    collections: [
      { id: 'col-1', collectionId: null, heading: 'Верхняя одежда', description: '', image: 'https://images.unsplash.com/photo-1551232864-3f0890e580d9?auto=format&fit=crop&w=800&q=80' },
      { id: 'col-2', collectionId: null, heading: 'Джемперы и кардиганы', description: '', image: 'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?auto=format&fit=crop&w=800&q=80' },
      { id: 'col-3', collectionId: null, heading: 'Футболки и топы', description: '', image: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=800&q=80' },
    ],
    columns: 3,
    padding: { top: 40, bottom: 40 },
  },
  schema: CollectionsSchema,
  maxInstances: null,
  constraints: {
    padding: { min: 0, max: 200, step: 8 },
    minColumns: 2,
    maxColumns: 4,
    maxItems: 10,
  },
};

import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

const CollectionItemSchema = z.object({
  id: z.string(),
  collectionId: z.string().nullable(), // nullable until merchant picks
  heading: z.string(),
  description: z.string().optional(),
  // Merchant-uploaded image URL; when absent the Astro template falls back
  // to `/placeholder-collection-<id>.jpg`.
  image: z.string().optional(),
});

export const CollectionsSchema = z.object({
  heading: z.string(),
  subtitle: z.string().optional(),
  headingSize: z.enum(['small', 'medium', 'large']).optional(),
  subtitleSize: z.enum(['small', 'medium', 'large']).optional(),
  /** Visual aspect ratio of tiles — square / portrait (Figma) / wide. */
  imageView: z.enum(['square', 'portrait', 'wide']).optional(),
  /**
   * `auto` pulls from the shop's collections feed at build time; `manual`
   * uses only the items in `collections[]`. Default auto.
   */
  dataSource: z.enum(['auto', 'manual']).optional(),
  collections: z.array(CollectionItemSchema).min(1).max(10),
  columns: z.number().int().min(1).max(6),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type CollectionsProps = z.infer<typeof CollectionsSchema>;

export const CollectionsPuckConfig: BlockPuckConfig<CollectionsProps> = {
  label: 'Коллекции',
  category: 'products',
  fields: {
    heading: { type: 'text', label: 'Заголовок' },
    subtitle: { type: 'text', label: 'Подзаголовок' },
    headingSize: {
      type: 'radio',
      label: 'Размер заголовка',
      options: [
        { label: 'Маленький', value: 'small' },
        { label: 'Средний', value: 'medium' },
        { label: 'Большой', value: 'large' },
      ],
    },
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
      label: 'Форма карточек',
      options: [
        { label: 'Квадрат', value: 'square' },
        { label: 'Портрет', value: 'portrait' },
        { label: 'Широкая', value: 'wide' },
      ],
    },
    dataSource: {
      type: 'radio',
      label: 'Источник данных',
      options: [
        { label: 'Автоматически', value: 'auto' },
        { label: 'Вручную', value: 'manual' },
      ],
    },
    collections: { type: 'array', label: 'Коллекции' },
    columns: { type: 'number', label: 'Колонки (1-6)' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    heading: 'Коллекции',
    subtitle: '',
    headingSize: 'medium',
    subtitleSize: 'small',
    imageView: 'square',
    dataSource: 'auto',
    collections: [
      { id: 'col-1', collectionId: null, heading: 'Коллекция 1', description: '' },
      { id: 'col-2', collectionId: null, heading: 'Коллекция 2', description: '' },
      { id: 'col-3', collectionId: null, heading: 'Коллекция 3', description: '' },
    ],
    columns: 3,
    padding: { top: 80, bottom: 80 },
  },
  schema: CollectionsSchema,
  maxInstances: null,
  constraints: {
    padding: { min: 0, max: 160, step: 8 },
    minColumns: 1,
    maxColumns: 6,
    maxItems: 10,
  },
};

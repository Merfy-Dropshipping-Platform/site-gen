import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

const MultiColumnItemSchema = z.object({
  id: z.string(),
  heading: z.string(),
  text: z.string(),
  imageUrl: z.string(),
});

export const MultiColumnsSchema = z.object({
  columns: z.array(MultiColumnItemSchema).min(1).max(10),
  displayColumns: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
  ]),
  // Pupa parity.
  heading: z.string().optional(),
  headingAlignment: z.enum(['left', 'center', 'right']).optional(),
  headingSize: z.enum(['small', 'medium', 'large']).optional(),
  width: z.enum(['small', 'medium', 'large', 'full']).optional(),
  imageAspectRatio: z.enum(['adapt', 'square', 'portrait', 'landscape']).optional(),
  buttonText: z.string().optional(),
  buttonLink: z.string().optional(),
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type MultiColumnsProps = z.infer<typeof MultiColumnsSchema>;

export const MultiColumnsPuckConfig: BlockPuckConfig<MultiColumnsProps> = {
  label: 'Мультиколонны (Satin)',
  category: 'layout',
  fields: {
    heading: { type: 'text', label: 'Заголовок секции' },
    headingAlignment: { type: 'alignment', label: 'Выравнивание заголовка' },
    headingSize: {
      type: 'radio',
      label: 'Размер заголовка',
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
    imageAspectRatio: {
      type: 'radio',
      label: 'Соотношение изображения',
      options: [
        { label: 'Адаптивное', value: 'adapt' },
        { label: 'Квадрат', value: 'square' },
        { label: 'Портрет', value: 'portrait' },
        { label: 'Альбом', value: 'landscape' },
      ],
    },
    buttonText: { type: 'text', label: 'Кнопка' },
    buttonLink: { type: 'pagePicker', label: 'Ссылка' },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    columns: {
      type: 'array',
      label: 'Колонки',
      arrayFields: {
        id: { type: 'text', label: 'ID' },
        heading: { type: 'text', label: 'Заголовок' },
        text: { type: 'textarea', label: 'Текст' },
        imageUrl: { type: 'text', label: 'URL изображения' },
      },
      defaultItemProps: { id: 'col-new', heading: 'Колонка', text: '', imageUrl: '' },
      max: 10,
    },
    displayColumns: {
      type: 'radio',
      label: 'Колонок в ряд',
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
        top: { type: 'number', label: 'Сверху (px)', min: 0, max: 160 },
        bottom: { type: 'number', label: 'Снизу (px)', min: 0, max: 160 },
      },
    },
  },
  defaults: {
    columns: [
      { id: 'col-1', heading: 'ДОСТАВКА', text: 'Быстрая доставка по всей России.', imageUrl: '' },
      { id: 'col-2', heading: 'ВОЗВРАТ', text: 'Лёгкий возврат в течение 14 дней.', imageUrl: '' },
      { id: 'col-3', heading: 'ПОДДЕРЖКА', text: 'Наша команда всегда на связи.', imageUrl: '' },
    ],
    displayColumns: 3,
    padding: { top: 80, bottom: 80 },
  },
  schema: MultiColumnsSchema,
  maxInstances: null,
  constraints: {
    padding: { min: 0, max: 160, step: 8 },
    minColumns: 1,
    maxColumns: 4,
    maxItems: 10,
  },
};

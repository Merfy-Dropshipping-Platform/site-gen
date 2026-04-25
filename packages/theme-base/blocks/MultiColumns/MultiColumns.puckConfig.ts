import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

const MultiColumnItemSchema = z.object({
  id: z.string(),
  heading: z.string(),
  text: z.string(),
  imageUrl: z.string(),
});

export const MultiColumnsSchema = z.object({
  heading: z.string().optional(),
  // Pupa parity: heading object с alignment + size (legacy `heading` text — fallback).
  headingAlignment: z.enum(['left', 'center', 'right']).optional(),
  headingSize: z.enum(['small', 'medium', 'large']).optional(),
  width: z.enum(['small', 'medium', 'large', 'full']).optional(),
  imageAspectRatio: z.enum(['adapt', 'square', 'portrait', 'landscape']).optional(),
  buttonText: z.string().optional(),
  buttonLink: z.string().optional(),
  columns: z.array(MultiColumnItemSchema).min(1).max(10),
  displayColumns: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
  ]),
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type MultiColumnsProps = z.infer<typeof MultiColumnsSchema>;

export const MultiColumnsPuckConfig: BlockPuckConfig<MultiColumnsProps> = {
  label: 'Мультиколонны',
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
    columns: {
      type: 'array',
      label: 'Колонки (макс 10)',
      arrayFields: {
        heading: { type: 'text', label: 'Заголовок' },
        text: { type: 'textarea', label: 'Описание' },
        imageUrl: { type: 'image', label: 'Иконка / изображение' },
      },
      defaultItemProps: { id: '', heading: 'Новая колонка', text: '', imageUrl: '' },
      max: 10,
    },
    displayColumns: {
      type: 'slider',
      label: 'Колонок в ряд',
      min: 1,
      max: 4,
      step: 1,
    },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },
  },
  defaults: {
    heading: '',
    columns: [
      { id: 'col-1', heading: 'Колонка 1', text: 'Описание первой колонки.', imageUrl: '' },
      { id: 'col-2', heading: 'Колонка 2', text: 'Описание второй колонки.', imageUrl: '' },
      { id: 'col-3', heading: 'Колонка 3', text: 'Описание третьей колонки.', imageUrl: '' },
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

import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

const MultiColumnItemSchema = z.object({
  id: z.string(),
  heading: z.string().optional(),
  text: z.string().optional(),
  imageUrl: z.string().optional(),
  // Pupa parity per-column: image/title/headingSize/description/textSize/link.
  image: z.string().optional(),
  imageSize: z.enum(['small', 'medium', 'large']).optional(),
  title: z.string().optional(),
  headingSize: z.enum(['small', 'medium', 'large']).optional(),
  description: z.string().optional(),
  textSize: z.enum(['small', 'medium', 'large']).optional(),
  link: z.object({
    text: z.string().optional(),
    href: z.string().optional(),
  }).optional(),
});

export const MultiColumnsSchema = z.object({
  heading: z.union([
    z.string(),
    z.object({
      text: z.string().optional(),
      alignment: z.enum(['left', 'center', 'right']).optional(),
      size: z.enum(['small', 'medium', 'large']).optional(),
    }),
  ]).optional(),
  // Pupa parity: heading object с alignment + size (legacy `heading` text — fallback).
  headingAlignment: z.enum(['left', 'center', 'right']).optional(),
  headingSize: z.enum(['small', 'medium', 'large']).optional(),
  width: z.enum(['small', 'medium', 'large', 'full']).optional(),
  imageAspectRatio: z.enum(['adapt', 'square', 'portrait', 'landscape']).optional(),
  buttonText: z.string().optional(),
  buttonLink: z.string().optional(),
  // Pupa parity: nested heading {text,alignment,size} + textPosition + background + containerColorScheme.
  textPosition: z.enum(['left', 'center']).optional(),
  background: z.object({ enabled: z.enum(['true', 'false']) }).optional(),
  containerColorScheme: z.string().optional(),
  link: z.string().optional(),
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
    textPosition: {
      type: 'radio',
      label: 'Положение текста',
      options: [
        { label: 'Слева', value: 'left' },
        { label: 'По центру', value: 'center' },
      ],
    },
    background: {
      type: 'object',
      label: 'Фон',
      objectFields: {
        enabled: {
          type: 'radio',
          label: 'Включён',
          options: [
            { label: 'Да', value: 'true' },
            { label: 'Нет', value: 'false' },
          ],
        },
      },
    },
    containerColorScheme: { type: 'colorScheme', label: 'Цветовая схема контейнера' },
    link: { type: 'pagePicker', label: 'Ссылка секции' },
    columns: {
      type: 'array',
      label: 'Колонки (макс 10)',
      arrayFields: {
        image: { type: 'image', label: 'Изображение' },
        imageSize: {
          type: 'radio',
          label: 'Размер изображения',
          options: [
            { label: 'Маленький', value: 'small' },
            { label: 'Средний', value: 'medium' },
            { label: 'Большой', value: 'large' },
          ],
        },
        title: { type: 'text', label: 'Заголовок' },
        headingSize: {
          type: 'radio',
          label: 'Размер заголовка',
          options: [
            { label: 'Маленький', value: 'small' },
            { label: 'Средний', value: 'medium' },
            { label: 'Большой', value: 'large' },
          ],
        },
        description: { type: 'textarea', label: 'Описание' },
        textSize: {
          type: 'radio',
          label: 'Размер текста',
          options: [
            { label: 'Маленький', value: 'small' },
            { label: 'Средний', value: 'medium' },
            { label: 'Большой', value: 'large' },
          ],
        },
        link: {
          type: 'object',
          label: 'Ссылка',
          objectFields: {
            text: { type: 'text', label: 'Текст' },
            href: { type: 'pagePicker', label: 'Ссылка' },
          },
        },
      },
      defaultItemProps: {
        id: '',
        image: '',
        title: 'Новая колонка',
        description: '',
        link: { text: '', href: '' },
      },
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

import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

// Satin MultiRows — same prop shape as base. Schema duplicated locally because
// value imports from @merfy/theme-base don't resolve in compiled dist layout.

const MultiRowItemSchema = z.object({
  id: z.string(),
  heading: z.string().optional(),
  text: z.string().optional(),
  imageUrl: z.string().optional(),
  imagePosition: z.enum(['left', 'right']).optional(),
  button: z.object({
    text: z.string().optional(),
    href: z.string().optional(),
    link: z.string().optional(),
  }).optional(),
  // Pupa per-row.
  image: z.string().optional(),
  size: z.enum(['small', 'medium', 'large']).optional(),
  width: z.enum(['small', 'medium', 'large', 'full']).optional(),
  title: z.string().optional(),
  headingSize: z.enum(['small', 'medium', 'large']).optional(),
  description: z.string().optional(),
  textSize: z.enum(['small', 'medium', 'large']).optional(),
});

export const MultiRowsSchema = z.object({
  rows: z.array(MultiRowItemSchema).min(1).max(10),
  // Pupa parity.
  heading: z.union([
    z.string(),
    z.object({
      text: z.string().optional(),
      alignment: z.enum(['left', 'center', 'right']).optional(),
      size: z.enum(['small', 'medium', 'large']).optional(),
    }),
  ]).optional(),
  headingAlignment: z.enum(['left', 'center', 'right']).optional(),
  headingSize: z.enum(['small', 'medium', 'large']).optional(),
  size: z.enum(['small', 'medium', 'large']).optional(),
  width: z.enum(['small', 'medium', 'large', 'full']).optional(),
  rowsPosition: z.enum(['left', 'right', 'alternate']).optional(),
  buttonStyle: z.enum(['primary', 'black', 'white', 'secondary']).optional(),
  alignment: z.enum(['left', 'center', 'right']).optional(),
  colorScheme: z.string().optional(),
  containerColorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type MultiRowsProps = z.infer<typeof MultiRowsSchema>;

export const MultiRowsPuckConfig: BlockPuckConfig<MultiRowsProps> = {
  label: 'Мультиряды (Satin)',
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
    containerColorScheme: { type: 'colorScheme', label: 'Цветовая схема контейнера' },
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
    size: {
      type: 'radio',
      label: 'Высота',
      options: [
        { label: 'Маленькая', value: 'small' },
        { label: 'Средняя', value: 'medium' },
        { label: 'Большая', value: 'large' },
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
    rowsPosition: {
      type: 'radio',
      label: 'Позиция рядов',
      options: [
        { label: 'Слева', value: 'left' },
        { label: 'Справа', value: 'right' },
        { label: 'Чередовать', value: 'alternate' },
      ],
    },
    buttonStyle: {
      type: 'radio',
      label: 'Стиль кнопки',
      options: [
        { label: 'Акцент', value: 'primary' },
        { label: 'Чёрная', value: 'black' },
        { label: 'Белая', value: 'white' },
      ],
    },
    alignment: { type: 'alignment', label: 'Выравнивание' },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    rows: {
      type: 'array',
      label: 'Ряды',
      arrayFields: {
        image: { type: 'image', label: 'Изображение' },
        size: {
          type: 'radio',
          label: 'Высота',
          options: [
            { label: 'Маленькая', value: 'small' },
            { label: 'Средняя', value: 'medium' },
            { label: 'Большая', value: 'large' },
          ],
        },
        width: {
          type: 'radio',
          label: 'Ширина изображения',
          options: [
            { label: 'Маленькая', value: 'small' },
            { label: 'Средняя', value: 'medium' },
            { label: 'Большая', value: 'large' },
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
        imagePosition: {
          type: 'radio',
          label: 'Позиция изображения',
          options: [
            { label: 'Слева', value: 'left' },
            { label: 'Справа', value: 'right' },
          ],
        },
        button: {
          type: 'object',
          label: 'Кнопка',
          objectFields: {
            text: { type: 'text', label: 'Текст' },
            href: { type: 'text', label: 'Ссылка' },
          },
        },
      },
      defaultItemProps: {
        id: 'row-new',
        heading: 'Новый ряд',
        text: '',
        imageUrl: '',
        imagePosition: 'left',
        button: { text: 'Подробнее', href: '/' },
      },
      max: 10,
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
    rows: [
      {
        id: 'row-1',
        heading: 'ЛУЧШИЕ ТКАНИ ДЛЯ ВАС',
        text: 'Мы используем только натуральные материалы высочайшего качества. Каждая коллекция создаётся с вниманием к деталям.',
        imageUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=80',
        imagePosition: 'left',
        button: { text: 'Подробнее', href: '/about' },
      },
      {
        id: 'row-2',
        heading: 'ФИЛОСОФИЯ БРЕНДА',
        text: 'Элегантность в каждой детали. Наша миссия — создавать одежду, которая подчёркивает индивидуальность.',
        imageUrl: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=1200&q=80',
        imagePosition: 'right',
        button: { text: 'О нас', href: '/about' },
      },
    ],
    padding: { top: 80, bottom: 80 },
  },
  schema: MultiRowsSchema,
  maxInstances: null,
  constraints: {
    padding: { min: 0, max: 160, step: 8 },
    maxItems: 10,
  },
};

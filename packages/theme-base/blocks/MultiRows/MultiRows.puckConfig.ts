import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

const MultiRowItemSchema = z.object({
  id: z.string(),
  heading: z.string(),
  text: z.string(),
  imageUrl: z.string(),
  imagePosition: z.enum(['left', 'right']),
  button: z.object({ text: z.string(), href: z.string() }),
});

export const MultiRowsSchema = z.object({
  rows: z.array(MultiRowItemSchema).min(1).max(10),
  // Pupa parity.
  heading: z.string().optional(),
  headingAlignment: z.enum(['left', 'center', 'right']).optional(),
  headingSize: z.enum(['small', 'medium', 'large']).optional(),
  size: z.enum(['small', 'medium', 'large']).optional(),
  width: z.enum(['small', 'medium', 'large', 'full']).optional(),
  rowsPosition: z.enum(['left', 'right', 'alternate']).optional(),
  buttonStyle: z.enum(['primary', 'black', 'white']).optional(),
  alignment: z.enum(['left', 'center', 'right']).optional(),
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type MultiRowsProps = z.infer<typeof MultiRowsSchema>;

export const MultiRowsPuckConfig: BlockPuckConfig<MultiRowsProps> = {
  label: 'Мультиряды',
  category: 'layout',
  fields: {
    heading: { type: 'text', label: 'Заголовок' },
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
      label: 'Ряды (макс 10)',
      arrayFields: {
        heading: { type: 'text', label: 'Заголовок' },
        text: { type: 'textarea', label: 'Описание' },
        imageUrl: { type: 'image', label: 'Изображение' },
        imagePosition: {
          type: 'radio',
          label: 'Положение изображения',
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
        id: '',
        heading: 'Новый ряд',
        text: '',
        imageUrl: '',
        imagePosition: 'left',
        button: { text: 'Подробнее', href: '/catalog' },
      },
      max: 10,
    },
    padding: { type: 'padding', label: 'Отступы' },
  },
  defaults: {
    rows: [
      {
        id: 'row-1',
        heading: 'Первый ряд',
        text: 'Описание первого ряда. Изображение слева.',
        imageUrl: '',
        imagePosition: 'left',
        button: { text: 'Подробнее', href: '/about' },
      },
      {
        id: 'row-2',
        heading: 'Второй ряд',
        text: 'Описание второго ряда. Изображение справа.',
        imageUrl: '',
        imagePosition: 'right',
        button: { text: 'Узнать больше', href: '/about' },
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

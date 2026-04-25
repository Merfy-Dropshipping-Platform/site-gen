import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

const MultiColumnItemSchema = z.object({
  id: z.string(),
  heading: z.string().optional(),
  text: z.string().optional(),
  imageUrl: z.string().optional(),
  // Pupa per-column.
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
  columns: z.array(MultiColumnItemSchema).min(1).max(10),
  displayColumns: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
  ]),
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
  width: z.enum(['small', 'medium', 'large', 'full']).optional(),
  imageAspectRatio: z.enum(['adapt', 'square', 'portrait', 'landscape']).optional(),
  buttonText: z.string().optional(),
  buttonLink: z.string().optional(),
  textPosition: z.enum(['left', 'center']).optional(),
  background: z.object({ enabled: z.enum(['true', 'false']) }).optional(),
  containerColorScheme: z.string().optional(),
  link: z.string().optional(),
  button: z.string().optional(),
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
    button: { type: 'text', label: 'Текст кнопки секции' },
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
        id: 'col-new',
        image: '',
        title: 'Колонка',
        description: '',
        link: { text: '', href: '' },
      },
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

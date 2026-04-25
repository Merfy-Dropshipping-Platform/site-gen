import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

const CollapsibleItemSchema = z.object({
  id: z.string(),
  heading: z.string(),
  content: z.string(),
});

export const CollapsibleSectionSchema = z.object({
  heading: z.union([
    z.string(),
    z.object({
      text: z.string().optional(),
      alignment: z.enum(['left', 'center', 'right']).optional(),
      size: z.enum(['small', 'medium', 'large']).optional(),
    }),
  ]).optional(),
  sections: z.array(CollapsibleItemSchema).min(1).max(10),
  items: z.array(z.object({
    id: z.string(),
    title: z.string().optional(),
    content: z.string().optional(),
  })).optional(),
  container: z.object({ enabled: z.enum(['true', 'false']) }).optional(),
  // Pupa parity.
  headingAlignment: z.enum(['left', 'center', 'right']).optional(),
  headingSize: z.enum(['small', 'medium', 'large']).optional(),
  containerEnabled: z.enum(['true', 'false']).optional(),
  colorScheme: z.string().optional(),
  containerColorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type CollapsibleSectionProps = z.infer<typeof CollapsibleSectionSchema>;

export const CollapsibleSectionPuckConfig: BlockPuckConfig<CollapsibleSectionProps> = {
  label: 'Сворачиваемый раздел (Satin)',
  category: 'content',
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
    container: {
      type: 'object',
      label: 'Контейнер',
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
    items: {
      type: 'array',
      label: 'Элементы (pupa)',
      arrayFields: {
        title: { type: 'text', label: 'Заголовок' },
        content: { type: 'textarea', label: 'Содержимое' },
      },
      defaultItemProps: { id: '', title: 'Новый элемент', content: '' },
      max: 10,
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
    containerEnabled: {
      type: 'radio',
      label: 'Контейнер',
      options: [
        { label: 'Показать', value: 'true' },
        { label: 'Скрыть', value: 'false' },
      ],
    },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    containerColorScheme: { type: 'colorScheme', label: 'Цветовая схема контейнера' },
    sections: {
      type: 'array',
      label: 'Пункты',
      arrayFields: {
        id: { type: 'text', label: 'ID' },
        heading: { type: 'text', label: 'Заголовок пункта' },
        content: { type: 'textarea', label: 'Контент (HTML)' },
      },
      defaultItemProps: { id: 'section-new', heading: 'Новый пункт', content: '' },
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
    heading: 'ВОПРОСЫ И ОТВЕТЫ',
    sections: [
      {
        id: 'faq-1',
        heading: 'КАК ОФОРМИТЬ ЗАКАЗ?',
        content: 'Добавьте товары в корзину, перейдите к оформлению, укажите данные доставки и способ оплаты.',
      },
      {
        id: 'faq-2',
        heading: 'СРОКИ ДОСТАВКИ',
        content: 'Доставка по Москве 1-2 дня, по России 3-7 дней в зависимости от региона.',
      },
      {
        id: 'faq-3',
        heading: 'УСЛОВИЯ ВОЗВРАТА',
        content: 'Вы можете вернуть товар в течение 14 дней с момента получения.',
      },
    ],
    padding: { top: 80, bottom: 80 },
  },
  schema: CollapsibleSectionSchema,
  maxInstances: null,
  constraints: {
    padding: { min: 0, max: 160, step: 8 },
    maxItems: 10,
  },
};

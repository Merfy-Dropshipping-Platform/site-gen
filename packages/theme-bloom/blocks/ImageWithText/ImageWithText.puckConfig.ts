import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

/**
 * Bloom override — КОНТРОЛЫ (fields/schema/label/category) дословная копия
 * канона packages/theme-base/blocks/ImageWithText/ImageWithText.puckConfig.ts
 * (inline-копия, НЕ cross-package import — тот же приём, что у
 * packages/theme-satin/blocks/ImageWithText/ImageWithText.puckConfig.ts, иначе
 * compile-astro-blocks.mjs падает).
 *
 * Единственное отличие от канона — поле `containerEnabled` (репорт тестера
 * 15.09, пункт [23]: «В Изображении с текстом у bloom добавить в сайдбар
 * тумблер контейнера (вкл/выкл)», владелец: «только в этой теме»). Формат
 * ТОТ ЖЕ toggle, что у MultiColumns/MultiRows/CollapsibleSection (канон
 * дизайнера Nikita, project_container_canon_audit): значения 'true'/'false',
 * дефолт 'false', контейнер = surface-бокс на текстовую колонку. Рендер —
 * themes/bloom/src/components/sections/ImageWithText.astro.
 */
export const ImageWithTextSchema = z.object({
  image: z.object({ url: z.string(), alt: z.string() }),
  heading: z.union([
    z.string(),
    z.object({
      text: z.string().optional(),
      alignment: z.enum(['left', 'center', 'right']).optional(),
      size: z.enum(['small', 'medium', 'large']).optional(),
    }),
  ]).optional(),
  text: z.union([
    z.string(),
    z.object({
      content: z.string().optional(),
      size: z.enum(['small', 'medium', 'large']).optional(),
    }),
  ]).optional(),
  button: z.object({
    text: z.string().optional(),
    href: z.string().optional(),
    link: z.string().optional(),
  }).optional(),
  imagePosition: z.enum(['left', 'right']).optional(),
  alignment: z.enum(['left', 'center', 'right']).optional(),
  ctaPosition: z.enum(['inline', 'bottom-pinned']).optional(),
  textStyle: z.enum(['normal', 'italic']).optional(),
  size: z.enum(['small', 'medium', 'large']).optional(),
  width: z.enum(['small', 'medium', 'large', 'full']).optional(),
  colorScheme: z.string().optional(),
  // Пункт [23]: тумблер «Контейнер» — только у bloom.
  containerEnabled: z.enum(['true', 'false']).optional(),
  containerColorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type ImageWithTextProps = z.infer<typeof ImageWithTextSchema>;

export const ImageWithTextPuckConfig: BlockPuckConfig<ImageWithTextProps> = {
  label: 'Изображение с текстом',
  category: 'content',
  fields: {
    image: {
      type: 'object',
      label: 'Изображения',
      objectFields: {
        url: { type: 'image', label: 'Фото' },
        alt: { type: 'hidden', label: '' },
      },
    },
    size: {
      type: 'select',
      label: 'Размер',
      options: [
        { label: 'Маленький', value: 'small' },
        { label: 'Средний', value: 'medium' },
        { label: 'Большой', value: 'large' },
      ],
    },
    width: {
      type: 'select',
      label: 'Ширина',
      options: [
        { label: 'Маленькая', value: 'small' },
        { label: 'Средняя', value: 'medium' },
        { label: 'Большая', value: 'large' },
      ],
    },
    imagePosition: {
      type: 'radio',
      label: 'Позиция фото',
      options: [
        { label: 'Слева', value: 'left' },
        { label: 'Справа', value: 'right' },
      ],
    },
    alignment: { type: 'alignment', label: 'Выравнивание' },
    // Пункт [23] репорта тестера 15.09 — тумблер «Контейнер», ТОЛЬКО bloom.
    // Формат дословно как у MultiColumns/MultiRows/CollapsibleSection.
    containerEnabled: {
      type: 'toggle',
      label: 'Контейнер',
      options: [
        { label: 'Показать', value: 'true' },
        { label: 'Скрыть', value: 'false' },
      ],
    } as any,
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    containerColorScheme: { type: 'hidden', label: '' },
    padding: { type: 'padding', label: 'Отступы' },
    heading: {
      type: 'object',
      label: 'Заголовок',
      hiddenInMainPanel: true,
      objectFields: {
        text: { type: 'aiText', label: 'Заголовок', fieldType: 'title', placeholder: 'Ввести текст...' } as any,
        size: {
          type: 'select',
          label: 'Размер заголовка',
          options: [
            { label: 'Маленький', value: 'small' },
            { label: 'Средний', value: 'medium' },
            { label: 'Большой', value: 'large' },
          ],
        },
      },
    } as any,
    text: {
      type: 'object',
      label: 'Текст',
      hiddenInMainPanel: true,
      objectFields: {
        content: { type: 'aiText', label: 'Текст', fieldType: 'description', placeholder: 'Ввести текст...' } as any,
        size: {
          type: 'select',
          label: 'Размер текста',
          options: [
            { label: 'Маленький', value: 'small' },
            { label: 'Средний', value: 'medium' },
            { label: 'Большой', value: 'large' },
          ],
        },
      },
    } as any,
    button: {
      type: 'object',
      label: 'Кнопка',
      hiddenInMainPanel: true,
      objectFields: {
        text: { type: 'text', label: 'Текст' },
        link: { type: 'pagePicker', label: 'Ссылка' },
      },
    } as any,
    ctaPosition: { type: 'hidden', label: '' },
    textStyle: { type: 'hidden', label: '' },
  },
  defaults: {
    image: { url: '', alt: '' },
    heading: 'Изображение с текстом',
    text: 'Покажи и расскажи о своем товаре в одном блоке',
    button: { text: 'Кнопка', href: '/about' },
    imagePosition: 'left',
    alignment: 'left',
    size: 'medium',
    width: 'large',
    // Дефолт ВЫКЛ (канон Nikita: containerEnabled default 'false' —
    // паритет с MultiColumns/MultiRows/CollapsibleSection). Существующие
    // секции bloom без этого поля рисуют как прежде — нет регрессии.
    containerEnabled: 'false',
  },
  schema: ImageWithTextSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};

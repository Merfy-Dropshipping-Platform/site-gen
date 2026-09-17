import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

/**
 * Bloom override — КОНТРОЛЫ (fields/schema/label/category) дословная копия
 * канона packages/theme-base/blocks/ImageWithText/ImageWithText.puckConfig.ts
 * (inline-копия, НЕ cross-package import — тот же приём, что у
 * packages/theme-satin/blocks/ImageWithText/ImageWithText.puckConfig.ts, иначе
 * compile-astro-blocks.mjs падает).
 *
 * Отличия от канона — раскладка «как у Shopify», ТОЛЬКО bloom (владелец,
 * 2026-09-17, дословно): «У Shopify видишь какие состояния у текста с
 * изображением. То есть тут какая-то вот настройка layout, а у нас это
 * настройка контейнер. И нужно сделать так же, чтобы менялись расположения.
 * И сделать пока это только на Bloom». Тумблер «Контейнер» (пункт [23]
 * репорта 15.09) заменён на:
 *   - `layout`: 'no-overlap' (дефолт, как раньше) | 'overlap' — карточка
 *     наезжает на фото (Shopify Layout: No overlap / Overlap);
 *   - `position`: 'top' | 'middle' (дефолт) | 'bottom' — положение карточки
 *     по вертикали (Shopify Position).
 * `width` (уже был в каноне) при `layout: 'overlap'` дополнительно меняет
 * пропорцию карточка/фото (Shopify Width). Рендер —
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
  // Shopify-раскладка — только у bloom (владелец, 2026-09-17).
  layout: z.enum(['no-overlap', 'overlap']).optional(),
  position: z.enum(['top', 'middle', 'bottom']).optional(),
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
    // Владелец 2026-09-17 — Shopify-раскладка, ТОЛЬКО bloom.
    layout: {
      type: 'toggle',
      label: 'Раскладка',
      options: [
        { label: 'Без наложения', value: 'no-overlap' },
        { label: 'С наложением', value: 'overlap' },
      ],
    } as any,
    position: {
      type: 'select',
      label: 'Положение',
      options: [
        { label: 'Сверху', value: 'top' },
        { label: 'По центру', value: 'middle' },
        { label: 'Снизу', value: 'bottom' },
      ],
    },
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
    // Дефолты сохраняют текущий вид (нет регрессии для существующих секций
    // bloom без этих полей): 'no-overlap' — прежняя раскладка бок о бок,
    // 'middle' — прежнее вертикальное центрирование (lg:items-center).
    layout: 'no-overlap',
    position: 'middle',
  },
  schema: ImageWithTextSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};

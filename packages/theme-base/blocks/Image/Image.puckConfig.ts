import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

/**
 * Image block — full-bleed/split image с опциональным overlay (heading +
 * subtitle + button). Сделан per Figma 1:33131 (Платформа-Конструктор-Landing
 * "Изображение") + 1:33460 (8 layout variants helpers).
 *
 * Отличие от ImageWithText: тут image это **сам блок** (full-bleed или split-half),
 * текст накладывается поверх или примыкает в card. ImageWithText — это grid
 * 50/50 с отдельной text-колонкой.
 */
export const ImageSchema = z.object({
  imageUrl: z.string().optional(),
  imageAlt: z.string().optional(),
  /** Второе изображение для split вариантов. */
  imageUrl2: z.string().optional(),
  imageAlt2: z.string().optional(),
  heading: z.string().optional(),
  text: z.string().optional(),
  button: z.object({
    text: z.string().optional(),
    href: z.string().optional(),
  }).optional(),
  /**
   * Layout variant per Figma 1:33460 (8 helpers):
   * - full: одно полное изображение
   * - split-h: 2 половинки horizontally (640x800 + 640x800)
   * - card-bottom-left: full image + текстовая card внизу слева
   * - card-bottom-center: card по центру
   * - card-bottom-right: card справа
   * - card-top-left/center/right: card сверху
   * - card-middle-left: card по центру слева
   */
  variant: z.enum([
    'full',
    'split-h',
    'card-bottom-left',
    'card-bottom-center',
    'card-bottom-right',
    'card-top-left',
    'card-top-center',
    'card-top-right',
    'card-middle-left',
  ]).optional(),
  /** Card position vertical alignment overlay. */
  cardAlign: z.enum(['top', 'middle', 'bottom']).optional(),
  /** Height of the image block. */
  height: z.enum(['auto', 'small', 'medium', 'large', 'full']).optional(),
  colorScheme: z.string().optional(),
  containerColorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }).optional(),
});

export type ImageProps = z.infer<typeof ImageSchema>;

export const ImagePuckConfig: BlockPuckConfig<ImageProps> = {
  label: 'Изображение',
  category: 'media',
  fields: {
    imageUrl: { type: 'text', label: 'Изображение (URL)' },
    imageAlt: { type: 'text', label: 'Alt' },
    variant: {
      type: 'select',
      label: 'Макет',
      options: [
        { label: 'Полное изображение', value: 'full' },
        { label: 'Двойное (горизонтально)', value: 'split-h' },
        { label: 'Карточка снизу-слева', value: 'card-bottom-left' },
        { label: 'Карточка снизу-по центру', value: 'card-bottom-center' },
        { label: 'Карточка снизу-справа', value: 'card-bottom-right' },
        { label: 'Карточка сверху-слева', value: 'card-top-left' },
        { label: 'Карточка сверху-по центру', value: 'card-top-center' },
        { label: 'Карточка сверху-справа', value: 'card-top-right' },
        { label: 'Карточка по центру-слева', value: 'card-middle-left' },
      ],
    },
    imageUrl2: { type: 'text', label: 'Второе изображение (split)' },
    imageAlt2: { type: 'text', label: 'Alt второго' },
    heading: { type: 'text', label: 'Заголовок (overlay)' },
    text: { type: 'textarea', label: 'Текст (overlay)' },
    button: {
      type: 'object',
      label: 'Кнопка',
      objectFields: {
        text: { type: 'text', label: 'Текст' },
        href: { type: 'text', label: 'Ссылка' },
      },
    },
    height: {
      type: 'select',
      label: 'Высота',
      options: [
        { label: 'Авто', value: 'auto' },
        { label: 'Малая', value: 'small' },
        { label: 'Средняя', value: 'medium' },
        { label: 'Большая', value: 'large' },
        { label: 'Полный экран', value: 'full' },
      ],
    },
  },
  defaultProps: {
    variant: 'full',
    height: 'medium',
    heading: 'Изображение',
    text: 'Покажи и расскажи о своем товаре в одном блоке',
    button: { text: 'Кнопка', href: '#' },
    padding: { top: 0, bottom: 0 },
  },
};

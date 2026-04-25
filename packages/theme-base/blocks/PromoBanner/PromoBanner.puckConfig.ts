import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

/**
 * Pupa parity: PromoBanner has exactly 5 fields.
 *   text, link {text, href}, size, colorScheme, padding
 * No more, no less. Legacy linkText/linkUrl preserved for back-compat read.
 */
export const PromoBannerSchema = z.object({
  text: z.string(),
  link: z.object({
    text: z.string().optional(),
    href: z.string().optional(),
  }).optional(),
  size: z.enum(['small', 'medium', 'large']).optional(),
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
  // Legacy back-compat fields (hidden from picker UI, read-only fallback in .astro).
  linkText: z.string().optional(),
  linkUrl: z.string().optional(),
});

export type PromoBannerProps = z.infer<typeof PromoBannerSchema>;

export const PromoBannerPuckConfig: BlockPuckConfig<PromoBannerProps> = {
  label: 'Промо-баннер',
  category: 'hero',
  fields: {
    text: { type: 'text', label: 'Текст' },
    link: {
      type: 'object',
      label: 'Ссылка',
      objectFields: {
        text: { type: 'text', label: 'Текст ссылки' },
        href: { type: 'pagePicker', label: 'Адрес' },
      },
    },
    size: {
      type: 'radio',
      label: 'Размер',
      options: [
        { label: 'Маленький', value: 'small' },
        { label: 'Средний', value: 'medium' },
        { label: 'Большой', value: 'large' },
      ],
    },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },
  },
  defaults: {
    text: 'Бесплатная доставка от 3000 ₽',
    link: { text: 'Подробнее', href: '/delivery' },
    size: 'medium',
    padding: { top: 12, bottom: 12 },
  },
  schema: PromoBannerSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};

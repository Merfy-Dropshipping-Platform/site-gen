import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const PromoBannerSchema = z.object({
  text: z.string(),
  linkText: z.string(),
  linkUrl: z.string(),
  colorScheme: z.string().optional(),
  // Pupa parity.
  size: z.enum(['small', 'medium', 'large']).optional(),
  link: z.object({
    text: z.string().optional(),
    href: z.string().optional(),
  }).optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type PromoBannerProps = z.infer<typeof PromoBannerSchema>;

export const PromoBannerPuckConfig: BlockPuckConfig<PromoBannerProps> = {
  label: 'Промо-баннер',
  category: 'hero',
  fields: {
    text: { type: 'text', label: 'Текст' },
    linkText: { type: 'text', label: 'Текст ссылки' },
    linkUrl: { type: 'pagePicker', label: 'Ссылка' },
    link: {
      type: 'object',
      label: 'Ссылка (pupa)',
      objectFields: {
        text: { type: 'text', label: 'Текст' },
        href: { type: 'pagePicker', label: 'Ссылка' },
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
    linkText: 'Подробнее',
    linkUrl: '/delivery',
    padding: { top: 12, bottom: 12 },
  },
  schema: PromoBannerSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};

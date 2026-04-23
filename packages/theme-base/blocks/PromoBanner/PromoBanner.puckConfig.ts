import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const PromoBannerSchema = z.object({
  text: z.string(),
  linkText: z.string(),
  linkUrl: z.string(),
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
    linkUrl: { type: 'text', label: 'URL ссылки' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    text: 'Бесплатная доставка от 3000 ₽',
    linkText: 'Подробнее',
    linkUrl: '/delivery',
    padding: { top: 40, bottom: 40 },
  },
  schema: PromoBannerSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};

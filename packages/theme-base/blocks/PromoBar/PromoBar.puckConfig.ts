import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const PromoBarSchema = z.object({
  text: z.string(),
  linkText: z.string().optional(),
  linkHref: z.string().optional(),
  colorScheme: z.string().optional(),
});

export type PromoBarProps = z.infer<typeof PromoBarSchema>;

export const PromoBarPuckConfig: BlockPuckConfig<PromoBarProps> = {
  label: 'Промо-полоска',
  category: 'announcements',
  fields: {
    text: { type: 'text', label: 'Текст' },
    linkText: { type: 'text', label: 'Текст ссылки' },
    linkHref: { type: 'text', label: 'URL ссылки' },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
  },
  defaults: {
    text: 'Бесплатная доставка на весь ассортимент.',
    linkText: 'смотреть больше',
    linkHref: '/promo',
  },
  schema: PromoBarSchema as unknown as BlockPuckConfig<PromoBarProps>['schema'],
  maxInstances: 1,
  constraints: {},
};

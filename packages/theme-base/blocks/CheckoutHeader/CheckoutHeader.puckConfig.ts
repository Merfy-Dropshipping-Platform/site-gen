import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const CheckoutHeaderSchema = z.object({
  siteTitle: z.string(),
  logoMode: z.enum(['text', 'image']),
  logoImage: z.string().nullable(),
  rightIcon: z.enum(['cart', 'account', 'back', 'none']),
  accountLink: z.string(),
  backLink: z.string(),
  cartLink: z.string(),
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type CheckoutHeaderProps = z.infer<typeof CheckoutHeaderSchema>;

// Sidebar per Figma 1:19998 (узел «Header» страницы checkout): только
// «Цветовая схема» + «Отступы». Бренд/лого/иконка/ссылки задаются на уровне
// темы и переносятся из home-шапки в unifyChromeInDist → в панели узла скрыты.
export const CheckoutHeaderPuckConfig: BlockPuckConfig<CheckoutHeaderProps> = {
  label: 'Шапка оформления',
  category: 'navigation',
  fields: {
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },
    siteTitle: { type: 'hidden', label: '' },
    logoMode: { type: 'hidden', label: '' },
    logoImage: { type: 'hidden', label: '' },
    rightIcon: { type: 'hidden', label: '' },
    accountLink: { type: 'hidden', label: '' },
    backLink: { type: 'hidden', label: '' },
    cartLink: { type: 'hidden', label: '' },
  },
  defaults: {
    siteTitle: 'Мой магазин',
    logoMode: 'text',
    logoImage: null,
    rightIcon: 'cart',
    accountLink: '/account',
    backLink: '/cart',
    cartLink: '/cart',
    colorScheme: 'scheme-2',
    padding: { top: 24, bottom: 24 },
  },
  schema: CheckoutHeaderSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 80, step: 4 } },
};

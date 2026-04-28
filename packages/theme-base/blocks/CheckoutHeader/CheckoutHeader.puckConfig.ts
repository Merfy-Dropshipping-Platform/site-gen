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
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type CheckoutHeaderProps = z.infer<typeof CheckoutHeaderSchema>;

export const CheckoutHeaderPuckConfig: BlockPuckConfig<CheckoutHeaderProps> = {
  label: 'Шапка оформления',
  category: 'navigation',
  fields: {
    siteTitle: { type: 'text', label: 'Название магазина' },
    logoMode: {
      type: 'radio',
      label: 'Тип лого',
      options: [
        { label: 'Текст', value: 'text' },
        { label: 'Картинка', value: 'image' },
      ],
    },
    logoImage: { type: 'mediaSlot', label: 'Картинка лого' },
    rightIcon: {
      type: 'radio',
      label: 'Иконка справа',
      options: [
        { label: 'Корзина', value: 'cart' },
        { label: 'Аккаунт', value: 'account' },
        { label: 'Назад', value: 'back' },
        { label: 'Нет', value: 'none' },
      ],
    },
    accountLink: { type: 'text', label: 'Ссылка на личный кабинет' },
    backLink: { type: 'text', label: 'Куда ведёт иконка «Назад»' },
    cartLink: { type: 'text', label: 'Ссылка на корзину' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    siteTitle: 'Мой магазин',
    logoMode: 'text',
    logoImage: null,
    rightIcon: 'cart',
    accountLink: '/account',
    backLink: '/cart',
    cartLink: '/cart',
    padding: { top: 24, bottom: 24 },
  },
  schema: CheckoutHeaderSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 80, step: 4 } },
};

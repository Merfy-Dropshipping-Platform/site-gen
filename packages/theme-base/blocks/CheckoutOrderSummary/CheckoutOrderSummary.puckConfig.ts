import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const CheckoutOrderSummarySchema = z.object({
  heading: z.string(),
  itemImageSize: z.enum(['compact', 'expanded']),
  showVariantLabels: z.boolean(),
  showCompareAtPrice: z.boolean(),
  promoToggle: z.object({
    enabled: z.boolean(),
    label: z.string(),
    applyButtonText: z.string(),
  }),
  bogoBadge: z.boolean(),
  padding: z.object({
    top: z.number().int().min(0).max(80),
    bottom: z.number().int().min(0).max(80),
  }),
});

export type CheckoutOrderSummaryProps = z.infer<typeof CheckoutOrderSummarySchema>;

export const CheckoutOrderSummaryPuckConfig: BlockPuckConfig<CheckoutOrderSummaryProps> = {
  label: 'Сводка заказа',
  category: 'form',
  fields: {
    heading: { type: 'text', label: 'Заголовок' },
    itemImageSize: {
      type: 'radio',
      label: 'Размер картинки',
      options: [
        { label: 'Компактный (96px)', value: 'compact' },
        { label: 'Расширенный (120px)', value: 'expanded' },
      ],
    },
    showVariantLabels: { type: 'boolean', label: 'Префиксы вариантов («Цвет:»)' },
    showCompareAtPrice: { type: 'boolean', label: 'Старая цена зачёркнутая' },
    promoToggle: { type: 'object', label: 'Промокод' },
    bogoBadge: { type: 'boolean', label: 'Badge «Подарок» для BOGO' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    heading: 'Сводка заказа',
    itemImageSize: 'compact',
    showVariantLabels: true,
    showCompareAtPrice: true,
    promoToggle: { enabled: true, label: 'У меня есть промокод', applyButtonText: 'Применить' },
    bogoBadge: true,
    padding: { top: 0, bottom: 0 },
  },
  schema: CheckoutOrderSummarySchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 80, step: 4 } },
};

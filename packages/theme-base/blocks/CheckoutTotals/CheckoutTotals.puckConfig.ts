import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const CheckoutTotalsSchema = z.object({
  deliveryLabel: z.string(),
  freeText: z.string(),
  totalLabel: z.string(),
  showSubtotal: z.boolean(),
  showDiscount: z.boolean(),
  padding: z.object({
    top: z.number().int().min(0).max(80),
    bottom: z.number().int().min(0).max(80),
  }),
});

export type CheckoutTotalsProps = z.infer<typeof CheckoutTotalsSchema>;

export const CheckoutTotalsPuckConfig: BlockPuckConfig<CheckoutTotalsProps> = {
  label: 'Итого',
  category: 'form',
  fields: {
    deliveryLabel: { type: 'text', label: 'Лейбл доставки' },
    freeText: { type: 'text', label: 'Текст «Бесплатно»' },
    totalLabel: { type: 'text', label: 'Лейбл итога' },
    showSubtotal: { type: 'boolean', label: 'Показать подытог' },
    showDiscount: { type: 'boolean', label: 'Показать скидку' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    deliveryLabel: 'Доставка',
    freeText: 'Бесплатно',
    totalLabel: 'Итого',
    showSubtotal: false,
    showDiscount: true,
    padding: { top: 0, bottom: 0 },
  },
  schema: CheckoutTotalsSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 80, step: 4 } },
};

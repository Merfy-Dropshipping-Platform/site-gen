import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const CheckoutLayoutSchema = z.object({
  showOrderSummary: z.boolean(),
  showTrustBadges: z.boolean(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type CheckoutLayoutProps = z.infer<typeof CheckoutLayoutSchema>;

export const CheckoutLayoutPuckConfig: BlockPuckConfig<CheckoutLayoutProps> = {
  label: 'Макет оформления',
  category: 'layout',
  fields: {
    showOrderSummary: { type: 'switch', label: 'Сводка заказа' },
    showTrustBadges: { type: 'switch', label: 'Доверительные бейджи' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    showOrderSummary: true,
    showTrustBadges: true,
    padding: { top: 48, bottom: 48 },
  },
  schema: CheckoutLayoutSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 160, step: 4 } },
};

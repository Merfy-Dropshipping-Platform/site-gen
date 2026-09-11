import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const CheckoutSummarySchema = z.object({
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }).optional(),
});

export type CheckoutSummaryProps = z.infer<typeof CheckoutSummarySchema>;

// «Сводка заказа» — мега-блок consolidate OrderSummary + Totals.
// Sidebar per Figma 1:19998: только Цветовая схема.
export const CheckoutSummaryPuckConfig: BlockPuckConfig<CheckoutSummaryProps> = {
  label: 'Сводка заказа',
  category: 'checkout',
  fields: {
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'hidden', label: '' },
  },
  defaults: {
    colorScheme: 'scheme-2',
    padding: { top: 0, bottom: 0 },
  },
  schema: CheckoutSummarySchema,
  maxInstances: 1,
};

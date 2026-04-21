import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

// Note: `padding` is REQUIRED here (not optional), unlike most other blocks.
// See inventory: packages/theme-base/blocks/BLOCK_INVENTORY.md § CheckoutSection.
export const CheckoutSectionSchema = z.object({
  colorScheme: z.number().int().min(1).max(4),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type CheckoutSectionProps = z.infer<typeof CheckoutSectionSchema>;

export const CheckoutSectionPuckConfig: BlockPuckConfig<CheckoutSectionProps> = {
  label: 'Оформление заказа',
  category: 'form',
  fields: {
    colorScheme: { type: 'number', label: 'Цветовая схема' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    colorScheme: 1,
    padding: { top: 80, bottom: 80 },
  },
  schema: CheckoutSectionSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};

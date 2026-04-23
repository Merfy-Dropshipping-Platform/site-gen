import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const CartSectionSchema = z.object({
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type CartSectionProps = z.infer<typeof CartSectionSchema>;

export const CartSectionPuckConfig: BlockPuckConfig<CartSectionProps> = {
  label: 'Корзина',
  category: 'layout',
  fields: {
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    padding: { top: 80, bottom: 80 },
  },
  schema: CartSectionSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};

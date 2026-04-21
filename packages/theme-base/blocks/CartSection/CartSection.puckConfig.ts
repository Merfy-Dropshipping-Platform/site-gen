import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const CartSectionSchema = z.object({
  colorScheme: z.number().int().min(1).max(4),
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
    colorScheme: { type: 'number', label: 'Цветовая схема' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    colorScheme: 1,
    padding: { top: 80, bottom: 80 },
  },
  schema: CartSectionSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};

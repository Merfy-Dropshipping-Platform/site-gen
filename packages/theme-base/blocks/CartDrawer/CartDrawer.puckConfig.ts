import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const CartDrawerSchema = z.object({
  position: z.enum(['left', 'right']),
  showCheckoutButton: z.boolean(),
  colorScheme: z.number().int().min(1).max(4),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type CartDrawerProps = z.infer<typeof CartDrawerSchema>;

export const CartDrawerPuckConfig: BlockPuckConfig<CartDrawerProps> = {
  label: 'Корзина-панель',
  category: 'layout',
  fields: {
    position: { type: 'radio', label: 'Позиция' },
    showCheckoutButton: { type: 'switch', label: 'Кнопка оформления' },
    colorScheme: { type: 'number', label: 'Цветовая схема' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    position: 'right',
    showCheckoutButton: true,
    colorScheme: 1,
    padding: { top: 24, bottom: 24 },
  },
  schema: CartDrawerSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 80, step: 4 } },
};

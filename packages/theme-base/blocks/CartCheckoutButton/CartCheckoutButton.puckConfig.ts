import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const CartCheckoutButtonSchema = z.object({
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }).optional(),
});

export type CartCheckoutButtonProps = z.infer<typeof CartCheckoutButtonSchema>;

// «Кнопка оформления заказа» — мини-блок без user-настройки (Figma 1:20818
// sidebar: "Настройка недоступна. Настраиваемые параметры отсутствуют").
export const CartCheckoutButtonPuckConfig: BlockPuckConfig<CartCheckoutButtonProps> = {
  label: 'Кнопка оформления заказа',
  category: 'cart',
  fields: {
    colorScheme: { type: 'hidden', label: '' },
    padding: { type: 'hidden', label: '' },
  },
  defaults: {
    padding: { top: 8, bottom: 80 },
  },
  schema: CartCheckoutButtonSchema,
  maxInstances: 1,
};

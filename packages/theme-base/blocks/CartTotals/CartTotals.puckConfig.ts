import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const CartTotalsSchema = z.object({
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }).optional(),
});

export type CartTotalsProps = z.infer<typeof CartTotalsSchema>;

// «Итоговая цена» — мини-блок без user-настройки (Figma 1:20818 sidebar
// показывает "Настройка недоступна. Настраиваемые параметры отсутствуют").
// padding и colorScheme — внутренние, не показаны в UI.
export const CartTotalsPuckConfig: BlockPuckConfig<CartTotalsProps> = {
  label: 'Итоговая цена',
  category: 'cart',
  fields: {
    colorScheme: { type: 'hidden', label: '' },
    padding: { type: 'hidden', label: '' },
  },
  defaults: {
    padding: { top: 0, bottom: 8 },
  },
  schema: CartTotalsSchema,
  maxInstances: 1,
};

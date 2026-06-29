import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const CartSectionSchema = z.object({
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
  // Цветовая схема секции корзины (номер 1..5, как контракт-тест). Дефолт 1 —
  // светлая схема (карта по умолчанию чистая/нейтральная); мерчант меняет.
  colorScheme: z.number().optional(),
});

export type CartSectionProps = z.infer<typeof CartSectionSchema>;

export const CartSectionPuckConfig: BlockPuckConfig<CartSectionProps> = {
  label: 'Корзина',
  category: 'layout',
  fields: {
    padding: { type: 'object', label: 'Отступы' },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
  },
  defaults: {
    colorScheme: 2,
    padding: { top: 80, bottom: 80 },
  },
  schema: CartSectionSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};

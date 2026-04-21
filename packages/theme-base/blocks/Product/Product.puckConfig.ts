import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const ProductSchema = z.object({
  productId: z.string(),
  colorScheme: z.number().int().min(1).max(4),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type ProductProps = z.infer<typeof ProductSchema>;

export const ProductPuckConfig: BlockPuckConfig<ProductProps> = {
  label: 'Товар (PDP)',
  category: 'products',
  fields: {
    productId: { type: 'text', label: 'ID товара' },
    colorScheme: { type: 'number', label: 'Цветовая схема' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    productId: '',
    colorScheme: 1,
    padding: { top: 80, bottom: 80 },
  },
  schema: ProductSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};

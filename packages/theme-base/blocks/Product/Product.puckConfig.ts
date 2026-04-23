import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const ProductSchema = z.object({
  productId: z.string(),
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
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    productId: '',
    padding: { top: 80, bottom: 80 },
  },
  schema: ProductSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};

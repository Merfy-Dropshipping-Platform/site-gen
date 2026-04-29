import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

// CartBody — основной блок страницы /cart. Heading + items list / empty state +
// auth link. Все тексты hardcoded в CartBodyIsland (по Figma 1:20942 / 1:20842).
// Sidebar мерчанта — только { colorScheme, padding } per Figma.

export const CartBodySchema = z.object({
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type CartBodyProps = z.infer<typeof CartBodySchema>;

export const CartBodyPuckConfig: BlockPuckConfig<CartBodyProps> = {
  label: 'Корзина',
  category: 'content',
  fields: {
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },
  },
  defaults: {
    colorScheme: 'scheme-1',
    padding: { top: 80, bottom: 40 },
  },
  schema: CartBodySchema,
  maxInstances: 1,
  constraints: {
    padding: { min: 0, max: 160, step: 8 },
  },
};

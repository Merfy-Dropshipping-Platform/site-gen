import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const CheckoutHeaderSchema = z.object({
  siteTitle: z.string(),
  colorScheme: z.number().int().min(1).max(4),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type CheckoutHeaderProps = z.infer<typeof CheckoutHeaderSchema>;

export const CheckoutHeaderPuckConfig: BlockPuckConfig<CheckoutHeaderProps> = {
  label: 'Шапка оформления',
  category: 'navigation',
  fields: {
    siteTitle: { type: 'text', label: 'Название магазина' },
    colorScheme: { type: 'number', label: 'Цветовая схема' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    siteTitle: 'Мой магазин',
    colorScheme: 1,
    padding: { top: 24, bottom: 24 },
  },
  schema: CheckoutHeaderSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 80, step: 4 } },
};

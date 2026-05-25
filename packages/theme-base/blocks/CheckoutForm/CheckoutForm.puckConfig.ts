import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const CheckoutFormSchema = z.object({
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }).optional(),
});

export type CheckoutFormProps = z.infer<typeof CheckoutFormSchema>;

// «Оформление заказа» — мега-блок consolidate 6 inner блоков
// (Contact / Delivery / DeliveryMethod / Payment / Submit / Terms).
// Sidebar per Figma 1:19998: только Цветовая схема. Inner config — hardcoded
// per Figma reference (вариаций нет, merchant не редактирует).
export const CheckoutFormPuckConfig: BlockPuckConfig<CheckoutFormProps> = {
  label: 'Оформление заказа',
  category: 'checkout',
  fields: {
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'hidden', label: '' },
  },
  defaults: {
    colorScheme: 'scheme-2',
    padding: { top: 0, bottom: 0 },
  },
  schema: CheckoutFormSchema,
  maxInstances: 1,
};

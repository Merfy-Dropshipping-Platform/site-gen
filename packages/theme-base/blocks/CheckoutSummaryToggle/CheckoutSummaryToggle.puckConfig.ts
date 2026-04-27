import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const CheckoutSummaryToggleSchema = z.object({
  headerText: z.string(),
  dropdownIcon: z.enum(['chevron', 'arrow']),
  responsive: z.object({
    showOnMobile: z.boolean(),
    showOnDesktop: z.boolean(),
  }),
  padding: z.object({
    top: z.number().int().min(0).max(80),
    bottom: z.number().int().min(0).max(80),
  }),
});

export type CheckoutSummaryToggleProps = z.infer<typeof CheckoutSummaryToggleSchema>;

export const CheckoutSummaryTogglePuckConfig: BlockPuckConfig<CheckoutSummaryToggleProps> = {
  label: 'Сводка заказа (toggle)',
  category: 'form',
  fields: {
    headerText: { type: 'text', label: 'Текст заголовка' },
    dropdownIcon: {
      type: 'radio',
      label: 'Иконка дропдауна',
      options: [
        { label: 'Chevron ▾', value: 'chevron' },
        { label: 'Arrow ↓', value: 'arrow' },
      ],
    },
    responsive: { type: 'object', label: 'Видимость' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    headerText: 'Сводка заказа',
    dropdownIcon: 'chevron',
    responsive: { showOnMobile: true, showOnDesktop: false },
    padding: { top: 12, bottom: 12 },
  },
  schema: CheckoutSummaryToggleSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 80, step: 4 } },
};

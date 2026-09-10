import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const CheckoutLayoutSchema = z.object({
  summaryPosition: z.enum(['right', 'bottom']),
  formColumnWidth: z.number().int().min(360).max(960),
  summaryColumnWidth: z.number().int().min(280).max(960),
  gap: z.number().int().min(16).max(160),
  breakpoint: z.number().int().min(480).max(1280),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type CheckoutLayoutProps = z.infer<typeof CheckoutLayoutSchema>;

export const CheckoutLayoutPuckConfig: BlockPuckConfig<CheckoutLayoutProps> = {
  label: 'Чекаут (контейнер)',
  category: 'layout',
  fields: {
    summaryPosition: {
      type: 'radio',
      label: 'Положение сводки',
      options: [
        { label: 'Справа', value: 'right' },
        { label: 'Снизу', value: 'bottom' },
      ],
    },
    formColumnWidth: { type: 'number', label: 'Ширина формы заказа' },
    summaryColumnWidth: { type: 'number', label: 'Ширина сводки заказа' },
    gap: { type: 'number', label: 'Расстояние между колонками' },
    breakpoint: { type: 'number', label: 'Ширина экрана для перехода в одну колонку' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    summaryPosition: 'right',
    formColumnWidth: 652,
    summaryColumnWidth: 884,
    gap: 64,
    breakpoint: 768,
    // Per Figma 1:13398 — top spacing is supplied by the form column's
    // pt-16 below the header. Keep `top` as 0 here so we don't double up.
    padding: { top: 0, bottom: 80 },
  },
  schema: CheckoutLayoutSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};

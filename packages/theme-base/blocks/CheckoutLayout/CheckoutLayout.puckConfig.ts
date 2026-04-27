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
        { label: 'Справа (desktop)', value: 'right' },
        { label: 'Снизу', value: 'bottom' },
      ],
    },
    formColumnWidth: { type: 'number', label: 'Ширина формы (px, desktop)' },
    summaryColumnWidth: { type: 'number', label: 'Ширина сводки (px, desktop)' },
    gap: { type: 'number', label: 'Промежуток между колонками (px)' },
    breakpoint: { type: 'number', label: 'Брейкпоинт mobile→desktop (px)' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    summaryPosition: 'right',
    formColumnWidth: 652,
    summaryColumnWidth: 884,
    gap: 64,
    breakpoint: 768,
    padding: { top: 80, bottom: 80 },
  },
  schema: CheckoutLayoutSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};

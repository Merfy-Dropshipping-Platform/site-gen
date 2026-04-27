import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const CheckoutSubmitSchema = z.object({
  buttonText: z.string(),
  buttonStyle: z.enum(['fill', 'outline', 'gradient']),
  loadingText: z.string(),
  successRedirectUrl: z.string(),
  padding: z.object({
    top: z.number().int().min(0).max(80),
    bottom: z.number().int().min(0).max(80),
  }),
});

export type CheckoutSubmitProps = z.infer<typeof CheckoutSubmitSchema>;

export const CheckoutSubmitPuckConfig: BlockPuckConfig<CheckoutSubmitProps> = {
  label: 'Кнопка оплаты',
  category: 'form',
  fields: {
    buttonText: { type: 'text', label: 'Текст кнопки ({total} = сумма)' },
    buttonStyle: {
      type: 'radio',
      label: 'Стиль',
      options: [
        { label: 'Заливка', value: 'fill' },
        { label: 'Контур', value: 'outline' },
        { label: 'Градиент', value: 'gradient' },
      ],
    },
    loadingText: { type: 'text', label: 'Текст в состоянии загрузки' },
    successRedirectUrl: { type: 'text', label: 'URL успеха' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    buttonText: 'Оплатить {total}',
    buttonStyle: 'fill',
    loadingText: 'Обработка платежа…',
    successRedirectUrl: '/checkout-result',
    padding: { top: 0, bottom: 0 },
  },
  schema: CheckoutSubmitSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 80, step: 4 } },
};

import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

const CustomMethodSchema = z.object({
  label: z.string(),
  priceCents: z.number().int().min(0),
  etaText: z.string(),
});

export const CheckoutDeliveryMethodSchema = z.object({
  heading: z.string(),
  pickupEnabled: z.boolean(),
  pickupLabel: z.string(),
  customMethods: z.array(CustomMethodSchema),
  freeShippingThresholdCents: z.number().int().min(0).nullable(),
  padding: z.object({
    top: z.number().int().min(0).max(80),
    bottom: z.number().int().min(0).max(80),
  }),
});

export type CheckoutDeliveryMethodProps = z.infer<typeof CheckoutDeliveryMethodSchema>;

export const CheckoutDeliveryMethodPuckConfig: BlockPuckConfig<CheckoutDeliveryMethodProps> = {
  label: 'Способ доставки',
  category: 'form',
  fields: {
    heading: { type: 'text', label: 'Заголовок' },
    pickupEnabled: { type: 'boolean', label: 'Самовывоз из магазина' },
    pickupLabel: { type: 'text', label: 'Лейбл самовывоза' },
    customMethods: {
      type: 'array',
      label: 'Кастомные способы',
      itemFields: {
        label: { type: 'text', label: 'Название' },
        priceCents: { type: 'number', label: 'Цена (копейки)' },
        etaText: { type: 'text', label: 'Срок' },
      },
    },
    freeShippingThresholdCents: { type: 'number', label: 'Бесплатно от (копейки), пусто = выкл' },
    padding: { type: 'padding', label: 'Отступы' },
  },
  defaults: {
    heading: 'Способ доставки',
    pickupEnabled: true,
    pickupLabel: 'Самовывоз',
    customMethods: [],
    freeShippingThresholdCents: null,
    padding: { top: 0, bottom: 0 },
  },
  schema: CheckoutDeliveryMethodSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 80, step: 4 } },
};

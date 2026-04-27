import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

const CustomMethodSchema = z.object({
  label: z.string(),
  priceCents: z.number().int().min(0),
  etaText: z.string(),
});

export const CheckoutDeliveryMethodSchema = z.object({
  heading: z.string(),
  cdekEnabled: z.boolean(),
  cdekDoorLabel: z.string(),
  cdekPvzLabel: z.string(),
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
    cdekEnabled: { type: 'boolean', label: 'СДЭК (курьер + ПВЗ)' },
    cdekDoorLabel: { type: 'text', label: 'Лейбл «Курьер до двери»' },
    cdekPvzLabel: { type: 'text', label: 'Лейбл «До пункта выдачи»' },
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
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    heading: 'Способ доставки',
    cdekEnabled: true,
    cdekDoorLabel: 'Курьер до двери',
    cdekPvzLabel: 'До пункта выдачи',
    pickupEnabled: false,
    pickupLabel: 'Самовывоз',
    customMethods: [],
    freeShippingThresholdCents: null,
    padding: { top: 0, bottom: 0 },
  },
  schema: CheckoutDeliveryMethodSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 80, step: 4 } },
};

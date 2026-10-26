import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';
import {
  DEFAULT_PAYMENT_METHODS,
  PAYMENT_METHOD_KEYS,
  PAYMENT_METHOD_OPTIONS,
} from '../../runtime/payment-methods';

const PaymentMethodKey = z.enum(PAYMENT_METHOD_KEYS);

const PaymentMethodSchema = z.object({
  key: PaymentMethodKey,
  enabled: z.boolean(),
  label: z.string(),
});

export const CheckoutPaymentSchema = z.object({
  heading: z.string(),
  subheading: z.string(),
  methods: z.array(PaymentMethodSchema).min(1),
  // Форма карты (`cardForm`) убрана: данные карты покупатель вводит на странице платёжки.
  // Схема не строгая — старые ревизии с `cardForm` разбираются, лишнее поле отбрасывается.
  padding: z.object({
    top: z.number().int().min(0).max(80),
    bottom: z.number().int().min(0).max(80),
  }),
});

export type CheckoutPaymentProps = z.infer<typeof CheckoutPaymentSchema>;

export const CheckoutPaymentPuckConfig: BlockPuckConfig<CheckoutPaymentProps> = {
  label: 'Платёжная система',
  category: 'form',
  fields: {
    heading: { type: 'text', label: 'Заголовок' },
    subheading: { type: 'text', label: 'Подзаголовок' },
    methods: {
      type: 'array',
      label: 'Методы оплаты',
      itemFields: {
        key: {
          type: 'select',
          label: 'Тип',
          options: PAYMENT_METHOD_OPTIONS,
        },
        enabled: { type: 'boolean', label: 'Включён' },
        label: { type: 'text', label: 'Подпись' },
      },
    },
    padding: { type: 'padding', label: 'Отступы' },
  },
  defaults: {
    heading: 'Платёжная система',
    subheading: 'Все транзакции безопасны и зашифрованы',
    // Все способы каталога включены: покупателю витрина покажет только те,
    // что открывает платёжка магазина (enabledMethods из billing).
    methods: DEFAULT_PAYMENT_METHODS,
    padding: { top: 0, bottom: 0 },
  },
  schema: CheckoutPaymentSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 80, step: 4 } },
};

import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

const PaymentMethodKey = z.enum(['bank_card', 'sbp', 'sberbank', 'tinkoff_bank']);

const PaymentMethodSchema = z.object({
  key: PaymentMethodKey,
  enabled: z.boolean(),
  label: z.string(),
});

export const CheckoutPaymentSchema = z.object({
  heading: z.string(),
  subheading: z.string(),
  methods: z.array(PaymentMethodSchema).min(1),
  cardForm: z.object({
    cvvHelpEnabled: z.boolean(),
    nameOnCardEnabled: z.boolean(),
    warningText: z.string(),
  }),
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
          options: [
            { label: 'Банковская карта', value: 'bank_card' },
            { label: 'СБП', value: 'sbp' },
            { label: 'Sber Pay', value: 'sberbank' },
            { label: 'T-Pay', value: 'tinkoff_bank' },
          ],
        },
        enabled: { type: 'boolean', label: 'Включён' },
        label: { type: 'text', label: 'Подпись' },
      },
    },
    cardForm: { type: 'object', label: 'Форма карты' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    heading: 'Платёжная система',
    subheading: 'Все транзакции безопасны и зашифрованы',
    methods: [
      { key: 'bank_card', enabled: true, label: 'Банковская карта' },
      { key: 'sbp', enabled: true, label: 'СБП (Система быстрых платежей)' },
      { key: 'sberbank', enabled: false, label: 'Sber Pay' },
      { key: 'tinkoff_bank', enabled: false, label: 'T-Pay' },
    ],
    cardForm: { cvvHelpEnabled: true, nameOnCardEnabled: true, warningText: 'Счёт будет выставлен по вашему адресу' },
    padding: { top: 0, bottom: 0 },
  },
  schema: CheckoutPaymentSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 80, step: 4 } },
};

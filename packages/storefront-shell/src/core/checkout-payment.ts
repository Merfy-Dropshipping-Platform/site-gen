import type { CheckoutPayment, PaymentMethod } from './types';

// Способы оплаты оформления (базовые секции, 03.11): ключи — контракт billing (SHOP_PAYMENT_METHODS), подписи — как на
// витрине пяти тем (theme-base runtime/payment-methods.ts). Полей карты на витрине нет: покупатель выбирает способ, а
// карту вводит или платёж подтверждает на странице платёжки, куда его ведёт create-payment.

export const PAYMENT_METHODS: readonly { readonly key: PaymentMethod; readonly title: string }[] = [
  { key: 'bank_card', title: 'Банковская карта' },
  { key: 'sbp', title: 'СБП (Система быстрых платежей)' },
  { key: 'sberbank', title: 'Sber Pay' },
  { key: 'tinkoff_bank', title: 'T-Pay' },
];

export const isPaymentMethod = (value: unknown): value is PaymentMethod =>
  PAYMENT_METHODS.some((method) => method.key === value);

// До ответа billing — все способы, выбран первый (как у пяти тем: нет данных — список не режем).
export const DEFAULT_PAYMENT: CheckoutPayment = {
  ready: false,
  methods: PAYMENT_METHODS,
  selected: 'bank_card',
  unavailable: false,
};

// Ответ GET /billing/shops/:id/payment-config/public → { data: { enabledMethods } }: список — способы магазина (выбор
// магазина ∩ возможности платёжки ∩ подключённое у неё); пустой — оплатить нечем; нет списка — не режем.
export function paymentOf(body: unknown, current: PaymentMethod | null): CheckoutPayment {
  const data: unknown = typeof body === 'object' && body !== null ? Reflect.get(body, 'data') : undefined;
  const enabled: unknown = typeof data === 'object' && data !== null ? Reflect.get(data, 'enabledMethods') : undefined;
  if (!Array.isArray(enabled)) return { ...DEFAULT_PAYMENT, ready: true, selected: current };
  const methods = PAYMENT_METHODS.filter((method) => enabled.includes(method.key));
  const kept = methods.find((method) => method.key === current)?.key;
  return {
    ready: true,
    methods,
    selected: kept ?? methods[0]?.key ?? null,
    unavailable: methods.length === 0,
  };
}

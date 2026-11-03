import type { CheckoutOrder, Money, OrderLine } from './types';

// «Спасибо за заказ» (базовые секции, 03.11): GET /orders/:id/summary → $order — как OrderConfirmation пяти тем.
// Номер заказа — из ?orderId= адреса, нет — последний оформленный в этом браузере (merfy:lastOrderId).

export const LAST_ORDER_KEY = 'merfy:lastOrderId';
// Оплата ещё идёт — сводку перечитываем, пока не станет ясно, но не дольше 15 раз через 2 с (как у пяти тем).
export const ORDER_POLL_MS = 2_000;
export const ORDER_POLL_TIMES = 15;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const textOf = (value: unknown): string => (typeof value === 'string' ? value : '');
const centsOf = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
const money = (amount: number): Money => ({ amount, currency: 'RUB' });

export const emptyOrder = (status: CheckoutOrder['status']): CheckoutOrder => ({
  status,
  number: '',
  name: '',
  contacts: [],
  delivery: '',
  address: '',
  payment: 'pending',
  lines: [],
  subtotal: money(0),
  discount: money(0),
  shipping: money(0),
  total: money(0),
});

const optionsOf = (value: unknown): Readonly<Record<string, string>> =>
  isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
      )
    : {};

function lineOf(item: Record<string, unknown>): OrderLine {
  const quantity = Math.max(1, centsOf(item.quantity));
  const total = item.totalCents === undefined ? centsOf(item.unitPriceCents) * quantity : centsOf(item.totalCents);
  return {
    title: textOf(item.name) || 'Товар',
    image: textOf(item.imageUrl) || null,
    options: optionsOf(item.options),
    quantity,
    total: money(total),
    gift: item.isBonus === true,
  };
}

// Статус оплаты: отказ или отмена — failed; succeeded — paid; остальное — ещё идёт.
const paymentOf = (status: string): CheckoutOrder['payment'] => {
  if (status === 'failed' || status === 'cancelled') return 'failed';
  return status === 'succeeded' || status === '' ? 'paid' : 'pending';
};

// Способ доставки: общие поля заказа раньше старых; самовывоз — «Самовывоз»; сырой код типа не показываем.
function deliveryOf(data: Record<string, unknown>): string {
  if (textOf(data.deliveryMode) === 'self_pickup' || textOf(data.deliveryType) === 'pickup') return 'Самовывоз';
  const label = textOf(data.deliveryLabel);
  const named = [data.deliveryTariffName, data.cdekTariffName, data.deliveryCarrierName].map(textOf).find((v) => v);
  if (named !== undefined) return named;
  if (label !== '' && label !== textOf(data.deliveryType)) return label;
  return textOf(data.deliveryType) === '' ? '' : 'Доставка';
}

function addressOf(data: Record<string, unknown>): string {
  const address = isRecord(data.shippingAddress) ? data.shippingAddress : {};
  const joined = [address.country, address.city, address.street, address.building]
    .map(textOf)
    .filter(Boolean)
    .join(', ');
  return (
    textOf(address.fullAddress) || joined || textOf(data.pickupPointAddress) || textOf(data.cdekPickupPointAddress)
  );
}

// Сводка заказа → $order; не по форме — null.
export function orderOf(body: unknown): CheckoutOrder | null {
  const data = isRecord(body) && body.success === true && isRecord(body.data) ? body.data : null;
  if (data === null) return null;
  const items = Array.isArray(data.items) ? data.items.filter(isRecord) : [];
  const discount = centsOf(data.discountCents) + centsOf(data.promoDiscountCents);
  const shipping = centsOf(data.deliveryCostCents);
  const total = centsOf(data.totalCents);
  const subtotal = data.subtotalCents === undefined ? total + discount - shipping : centsOf(data.subtotalCents);
  return {
    status: 'ready',
    number: textOf(data.orderNumber),
    name: textOf(data.customerName).trim().split(/\s+/)[0] ?? '',
    contacts: [textOf(data.customerPhone), textOf(data.customerEmail)].filter((value) => value !== ''),
    delivery: deliveryOf(data),
    address: addressOf(data),
    payment: paymentOf(textOf(data.paymentStatus)),
    lines: items.map(lineOf),
    subtotal: money(Math.max(0, subtotal)),
    discount: money(discount),
    shipping: money(shipping),
    total: money(total),
  };
}

// Пример для превью конструктора: заказа нет, а секции есть что показать. Функцией, а не константой: вызовы money() на
// верхнем уровне сборщик оставил бы в ядре каждой страницы, даже без оформления.
export const sampleOrder = (): CheckoutOrder => ({
  status: 'ready',
  number: '0001',
  name: 'Иван',
  contacts: ['+7 (900) 000-00-00', 'ivan@example.com'],
  delivery: 'Курьер по городу',
  address: 'Российская Федерация, г. Москва, ул. Пушкина, д. 1, кв. 1',
  payment: 'paid',
  lines: [
    { title: 'Свитер', image: null, options: { Размер: 'M' }, quantity: 1, total: money(549_000), gift: false },
    { title: 'Шарф', image: null, options: { Цвет: 'Серый' }, quantity: 2, total: money(198_000), gift: false },
  ],
  subtotal: money(747_000),
  discount: money(0),
  shipping: money(0),
  total: money(747_000),
});

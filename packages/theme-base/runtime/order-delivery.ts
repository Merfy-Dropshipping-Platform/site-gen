/**
 * Доставка заказа глазами покупателя — страница заказа в личном кабинете.
 *
 * Владелец 26.09: в заказе стояло «Способ доставки: custom» и «Дата доставки: —».
 * Название способа, которое покупатель выбрал на оформлении («24 часа»,
 * тариф СДЭК), orders хранит в `cdekTariffName` (колонка переиспользована под
 * подпись любого тарифа, см. orders.service), а страница его не читала и
 * выводила сырой `delivery_type`.
 */

type OrderDelivery = {
  deliveryType?: unknown;
  cdekTariffName?: unknown;
  deliveryProfileName?: unknown;
  deliveryPeriodMin?: unknown;
  deliveryPeriodMax?: unknown;
};

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const days = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Подпись типа, когда своего названия у доставки нет. Сырой код не показываем. */
function typeLabel(type: string): string {
  if (type.includes('cdek')) return 'СДЭК';
  return type ? 'Доставка' : '—';
}

export function deliveryMethodLabel(order: OrderDelivery): string {
  const type = text(order.deliveryType);
  if (type === 'pickup') return 'Самовывоз';
  return text(order.cdekTariffName) || text(order.deliveryProfileName) || typeLabel(type);
}

function dayWord(n: number): string {
  const last = n % 10;
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 19) return 'дней';
  if (last === 1) return 'день';
  return last >= 2 && last <= 4 ? 'дня' : 'дней';
}

/** «1–3 дня», «2 дня»; срока нет — пустая строка (строку на странице не рисуем). */
export function deliveryPeriodLabel(order: OrderDelivery): string {
  const lo = days(order.deliveryPeriodMin) ?? days(order.deliveryPeriodMax);
  const hi = days(order.deliveryPeriodMax) ?? lo;
  if (lo === null || hi === null || hi <= 0) return '';
  const range = lo === hi ? String(hi) : `${lo}–${hi}`;
  return `${range} ${dayWord(hi)}`;
}

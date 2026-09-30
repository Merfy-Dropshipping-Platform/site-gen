/**
 * Доставка заказа глазами покупателя — страница заказа в личном кабинете и
 * блок доставки на «Спасибо за заказ» (OrderConfirmation).
 *
 * Владелец 26.09: в заказе стояло «Способ доставки: custom» и «Дата доставки: —».
 * Название способа, которое покупатель выбрал на оформлении («24 часа»,
 * тариф СДЭК), orders хранит в `cdekTariffName` (колонка переиспользована под
 * подпись любого тарифа, см. orders.service), а страница его не читала и
 * выводила сырой `delivery_type`.
 *
 * Spec 117, шаг 5.2: заказ хранит доставку в общих полях (data-model.md §
 * orders, шаги 2.1–2.3) — `deliveryTariffName`/`deliveryMode`/
 * `deliveryCarrierName` вместо проверки по имени перевозчика в строке типа.
 * Общие поля читаем первыми, старые (`cdekTariffName`) — запасными, для
 * заказов, у которых общие поля ещё не заполнены (перенос на старте, до
 * дозаписи событием отправления).
 */

type OrderDelivery = {
  deliveryType?: unknown;
  deliveryMode?: unknown;
  deliveryTariffName?: unknown;
  cdekTariffName?: unknown;
  deliveryProfileName?: unknown;
  deliveryCarrierName?: unknown;
  /**
   * Готовый ярлык от `/orders/:id/summary` (OrderConfirmation): сегодня шлюз
   * подставляет туда `deliveryType`, когда своего тарифа нет (contracts/
   * http.md § витрина, до `+deliveryCarrierName` на шлюзе) — такое значение
   * равно `deliveryType`, показом настоящего названия его не считаем.
   */
  deliveryLabel?: unknown;
  deliveryPeriodMin?: unknown;
  deliveryPeriodMax?: unknown;
};

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const days = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Подпись, когда своего тарифа и перевозчика нет. Сырой код не показываем. */
function typeLabel(type: string): string {
  return type ? 'Доставка' : '—';
}

export function deliveryMethodLabel(order: OrderDelivery): string {
  const type = text(order.deliveryType);
  if (order.deliveryMode === 'self_pickup' || type === 'pickup') return 'Самовывоз';
  const label = text(order.deliveryLabel);
  return (
    text(order.deliveryTariffName) ||
    text(order.cdekTariffName) ||
    text(order.deliveryProfileName) ||
    text(order.deliveryCarrierName) ||
    (label && label !== type ? label : '') ||
    typeLabel(type)
  );
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

/** Номер отправления — общее поле события `shipment.*`, старый номер СДЭК запасной. */
export function deliveryTrackingNumber(order: { trackingNumber?: unknown; cdekNumber?: unknown }): string {
  return text(order.trackingNumber) || text(order.cdekNumber);
}

/**
 * Готовая ссылка отслеживания — перевозчик формирует её сам (событие
 * `shipment.*` / перенос старых заказов, data-model.md § orders). Старого
 * аналога нет: до шага 2.1 заказ ссылку не хранил вовсе.
 */
export function deliveryTrackingUrl(order: { trackingUrl?: unknown }): string {
  return text(order.trackingUrl);
}

/**
 * Статусы отправления «груз ещё у продавца» — зеркало orders
 * `src/delivery/shipment-status.ts` (`BEFORE_HANDOVER`, data-model.md § общий
 * словарь). Используется только пока `shipmentCancellable` не пришёл.
 */
const BEFORE_HANDOVER = new Set(['REGISTERING', 'REGISTRATION_FAILED', 'CREATED']);

/**
 * Может ли покупатель сам отменить заказ — зеркало orders
 * `customerMayCancelShipment` (решение владельца 29.09): решает перевозчик
 * (`shipmentCancellable`), а пока его слова нет — по статусу отправления
 * (груз ещё не передан перевозчику). Стадию заказа (paid/processing)
 * проверяет вызывающая страница — здесь только про отправление.
 */
export function customerMayCancelShipment(order: {
  shipmentCancellable?: unknown;
  deliveryStatus?: unknown;
}): boolean {
  if (typeof order.shipmentCancellable === 'boolean') return order.shipmentCancellable;
  const status = order.deliveryStatus;
  return status == null || (typeof status === 'string' && BEFORE_HANDOVER.has(status));
}

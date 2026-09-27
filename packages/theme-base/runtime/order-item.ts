/**
 * Позиция заказа глазами покупателя — страница заказа в личном кабинете.
 *
 * Владелец 27.09: у товара в заказе «Товар» вместо названия и «—» вместо цены.
 * Страница читала `productName` / `priceCents` / `comparePriceCents`, а у
 * позиции заказа (orders `order_items`) поля другие: `name`, `unitPriceCents`,
 * `discountCents`, `totalCents`. `totalCents` = цена × количество без скидки,
 * скидка на строку лежит отдельно в `discountCents` — за штуку покупатель
 * заплатил цену минус свою долю скидки, а обычная цена становится старой.
 */

type OrderItem = {
  name?: unknown;
  productName?: unknown;
  quantity?: unknown;
  unitPriceCents?: unknown;
  priceCents?: unknown;
  totalCents?: unknown;
  discountCents?: unknown;
  comparePriceCents?: unknown;
};

export type OrderItemView = {
  name: string;
  quantity: number;
  /** Цена за штуку, которую заплатил покупатель; null — цены нет в данных. */
  priceCents: number | null;
  /** Зачёркнутая цена за штуку; null — скидки не было. */
  oldPriceCents: number | null;
};

const cents = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export function orderItemView(item: OrderItem): OrderItemView {
  const quantity = Math.max(1, Math.round(cents(item.quantity) ?? 1));
  const total = cents(item.totalCents);
  const unit = cents(item.unitPriceCents) ?? cents(item.priceCents) ?? (total === null ? null : Math.round(total / quantity));
  const discountPerUnit = Math.max(0, Math.round((cents(item.discountCents) ?? 0) / quantity));
  const paid = unit === null ? null : unit - discountPerUnit;
  const compare = cents(item.comparePriceCents);
  const listPrice = compare !== null && compare > (unit ?? 0) ? compare : unit;
  return {
    name: text(item.name) || text(item.productName) || 'Товар',
    quantity,
    priceCents: paid,
    oldPriceCents: paid !== null && listPrice !== null && listPrice > paid ? listPrice : null,
  };
}

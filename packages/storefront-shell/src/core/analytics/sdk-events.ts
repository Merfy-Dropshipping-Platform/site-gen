import type { EventType, ProductLine } from './events.ts';

// Перевод событий SDK в типы сборщика аналитики (блок 13 «Секций и SDK», «Решил сам» 16): начало визита — session_start
// (сам модуль), merfy:page:view — page_view (part.ts), корзина — таблица CART_RULES. merfy:cart:change — по знаку
// разницы: штук стало больше — «в корзину», меньше — «из корзины», на разницу. Цена в сборщик не уходит (блок 11).
export interface CartChange {
  readonly type: Extract<EventType, 'add_to_cart' | 'remove_from_cart'>;
  readonly product: ProductLine;
}

export const CART_EVENTS = ['merfy:cart:add', 'merfy:cart:remove', 'merfy:cart:change'] as const;
type CartEvent = (typeof CART_EVENTS)[number];

const fieldOf = (detail: unknown, key: string): unknown =>
  typeof detail === 'object' && detail !== null ? Reflect.get(detail, key) : undefined;
const textAt = (detail: unknown, key: string): string => {
  const value = fieldOf(detail, key);
  return typeof value === 'string' ? value : '';
};
const countAt = (detail: unknown, key: string): number => {
  const value = fieldOf(detail, key);
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
};

// Разница штук события: «в корзину» и «из корзины» — quantity, смена количества — quantity − previousQuantity.
const CART_RULES: Readonly<Record<CartEvent, (detail: unknown) => number>> = {
  'merfy:cart:add': (detail) => countAt(detail, 'quantity'),
  'merfy:cart:remove': (detail) => -countAt(detail, 'quantity'),
  'merfy:cart:change': (detail) => countAt(detail, 'quantity') - countAt(detail, 'previousQuantity'),
};

export function cartChangeOf(name: CartEvent, detail: unknown): CartChange | null {
  const id = textAt(detail, 'productId');
  const delta = CART_RULES[name](detail);
  if (id === '' || delta === 0) return null;
  return { type: delta > 0 ? 'add_to_cart' : 'remove_from_cart', product: { id, quantity: Math.abs(delta) } };
}

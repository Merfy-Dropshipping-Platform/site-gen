import type { CartState } from '@merfy/shell';
import type { ProductLine } from './events.ts';

// «В корзину» и «из корзины» по разнице состояния корзины ядра (part('cart'), блок 7). Имён событий корзины у SDK нет
// (С7-17 и С7-8 отложены до API), поэтому модуль сравнивает строки до и после правки: товара стало больше — «в корзину»
// на разницу, меньше или строка ушла — «из корзины» на разницу. Порядок — строки «после», потом ушедшие.
export interface CartChange {
  type: 'add_to_cart' | 'remove_from_cart';
  product: ProductLine;
}

const quantities = (state: CartState): Map<string, number> =>
  new Map(state.lines.map((line): [string, number] => [line.productId, line.quantity]));

function changeOf(id: string, delta: number): CartChange[] {
  if (delta === 0) return [];
  return [{ type: delta > 0 ? 'add_to_cart' : 'remove_from_cart', product: { id, quantity: Math.abs(delta) } }];
}

export function cartChanges(before: CartState, after: CartState): CartChange[] {
  const was = quantities(before);
  const now = quantities(after);
  const ids = new Set([...now.keys(), ...was.keys()]);
  return [...ids].flatMap((id) => changeOf(id, (now.get(id) ?? 0) - (was.get(id) ?? 0)));
}

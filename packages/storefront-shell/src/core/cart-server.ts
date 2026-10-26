import { cartIdOf, lineOf, linesOf, totalsOf } from './cart-lines';
import { CART_MISSING_CODE, type Failure, type Reply, failureOf, reasonOf, serverCodeOf } from './failures';
import { requestJson } from './requests';
import type { CartLine, CartTotals } from './types';

// Запросы корзины к шлюзу (блок 9, часть 9а): чтение, создание, добавление. Каждый шаг — либо данные, либо Failure,
// либо missing: корзины с номером нет — это ветка «новая корзина», а не ошибка (п. 5). Ошибки не бросает requestJson.

export interface CartApi {
  readonly url: string;
  readonly storeId: string;
  readonly currency: string;
}

export type ReadCart =
  | { readonly kind: 'lines'; readonly lines: readonly CartLine[]; readonly totals: CartTotals | null }
  | { readonly kind: 'missing' }
  | { readonly kind: 'failure'; readonly failure: Failure };

export type CreatedCart =
  | { readonly kind: 'id'; readonly id: string }
  | { readonly kind: 'failure'; readonly failure: Failure };

export type AddedItem =
  | { readonly kind: 'line'; readonly line: CartLine }
  | { readonly kind: 'missing' }
  | { readonly kind: 'failure'; readonly failure: Failure };

export type AddItemBody = {
  readonly product_id: string;
  readonly quantity: number;
  readonly variant_id?: string;
};

// Чтение корзины: 404 или cart_not_found — корзины нет; успех — любой 2xx (запрос ядра к шлюзу), не по форме — Failure.
export async function readCart(api: CartApi, cartId: string): Promise<ReadCart> {
  const reply = await requestJson(`${api.url}/store/carts/${cartId}`, { method: 'GET' });
  if (reply.status === 404 || serverCodeOf(reply) === CART_MISSING_CODE) return { kind: 'missing' };
  if (reply.status < 200 || reply.status > 299) return { kind: 'failure', failure: failureOf(reasonOf(reply), readText(reply)) };
  const lines = linesOf(reply.body, api.currency);
  if (lines === null) return { kind: 'failure', failure: failureOf('server', 'cart: ответ корзины не по форме') };
  return { kind: 'lines', lines, totals: totalsOf(reply.body, api.currency) };
}

// Создание корзины: успех — любой 2xx с номером в теле, остальное — Failure.
export async function createCart(api: CartApi): Promise<CreatedCart> {
  const reply = await requestJson(`${api.url}/store/carts`, { method: 'POST', body: { store_id: api.storeId } });
  const id = reply.status >= 200 && reply.status < 300 ? cartIdOf(reply.body) : null;
  if (id !== null) return { kind: 'id', id };
  return { kind: 'failure', failure: failureOf(reasonOf(reply), `cart: создание корзины — статус ${reply.status}`) };
}

// Добавление строки: cart_not_found — missing; успех — любой 2xx, иначе Failure (у invalid текст автору — про товар).
export async function addItem(api: CartApi, cartId: string, body: AddItemBody): Promise<AddedItem> {
  const reply = await requestJson(`${api.url}/store/carts/${cartId}/items`, { method: 'POST', body });
  if (serverCodeOf(reply) === CART_MISSING_CODE) return { kind: 'missing' };
  if (reply.status < 200 || reply.status > 299)
    return { kind: 'failure', failure: failureOf(reasonOf(reply), invalidText(body.product_id)) };
  const line = lineOf(reply.body, api.currency);
  if (line === null) return { kind: 'failure', failure: failureOf('server', 'cart: ответ добавления не по форме') };
  return { kind: 'line', line };
}

const readText = (reply: Reply): string => `cart: чтение корзины — статус ${reply.status}`;

const invalidText = (productId: string): string => `cart.add: товара ${productId} нет — проверьте productId`;

export type ChangedItem = { readonly kind: 'done' } | { readonly kind: 'failure'; readonly failure: Failure };

// PATCH или DELETE строки: успех — любой 2xx; иначе — Failure по reasonOf (блок 10, Р10а-3).
const changedOf = (reply: Reply, what: string): ChangedItem =>
  reply.status >= 200 && reply.status < 300
    ? { kind: 'done' }
    : { kind: 'failure', failure: failureOf(reasonOf(reply), `cart: ${what} — статус ${reply.status}`) };

// PATCH /store/carts/:id/items/:itemId { quantity }; DELETE. Успех — любой 2xx, иначе Failure по reasonOf.
export async function changeItem(api: CartApi, cartId: string, lineId: string, quantity: number): Promise<ChangedItem> {
  const reply = await requestJson(`${api.url}/store/carts/${cartId}/items/${lineId}`, {
    method: 'PATCH',
    body: { quantity },
  });
  return changedOf(reply, 'изменение строки корзины');
}

export async function removeItem(api: CartApi, cartId: string, lineId: string): Promise<ChangedItem> {
  const reply = await requestJson(`${api.url}/store/carts/${cartId}/items/${lineId}`, { method: 'DELETE' });
  return changedOf(reply, 'удаление строки корзины');
}

import { addItem, createCart, type CartApi } from './cart-server';
import { failed, failureOf, reportFailure, type Reply } from './failures';
import { navigation } from './navigation';
import { apiOf, CART_ID_KEY, cartIdOf, markRead, readCartInto, type CartRuntime } from './parts/cart';
import { requestJson } from './requests';
import type { CartLine, CoreHandle, Result, SectionEvent } from './types';

// cart.open, cart.checkout и заказ после оплаты (блок 10, 10.2, 10.5; «Решил сам» пп. 4, 5, 9, 11; Р10а-5, Р10а-7,
// Р10а-8). Ключи — договор с нынешним оформлением (CheckoutSubmit, факт 25).

export const CHECKOUT_CART_KEY = 'merfy:cartId'; // номер для нынешнего оформления (факт 25)
export const HANDOFF_KEY = 'merfy:cart-handoff:v1'; // копия строк при переходе в оформление
export const PENDING_ORDER_KEY = 'merfy:pendingOrder'; // пишет оформление (CheckoutSubmit)
export const DRAWER_SELECTOR = '[data-open-on="cart-open"]';
export type Verdict = 'paid' | 'abandoned' | 'wait';

// Статус оплаты → что делать; таблица пяти тем (theme-base/runtime/paid-order-cart.ts). Незнакомый — wait.
export const PAYMENT_VERDICT: Readonly<Record<string, Verdict>> = {
  succeeded: 'paid',
  refunded: 'paid',
  failed: 'abandoned',
  cancelled: 'abandoned',
  not_found: 'abandoned',
  pending: 'wait',
  processing: 'wait',
};

export interface HandoffLine {
  readonly productId: string;
  readonly variantId: string | null;
  readonly quantity: number;
}

export interface Handoff {
  readonly cartId: string;
  readonly lines: readonly HandoffLine[];
}

// Строка копии: productId — непустая строка, variantId — строка или null, quantity — целое от 1.
const handoffLineOf = (value: unknown): HandoffLine | null => {
  if (typeof value !== 'object' || value === null) return null;
  const productId: unknown = Reflect.get(value, 'productId');
  const variantId: unknown = Reflect.get(value, 'variantId');
  const quantity: unknown = Reflect.get(value, 'quantity');
  const idOk = typeof productId === 'string' && productId !== '';
  const variantOk = variantId === null || (typeof variantId === 'string' && variantId !== '');
  const quantityOk = typeof quantity === 'number' && Number.isInteger(quantity) && quantity >= 1;
  return idOk && variantOk && quantityOk ? { productId, variantId, quantity } : null;
};

// Разбор копии: мусор, пустой cartId, строки не по форме — null.
function handoffOf(raw: string): Handoff | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null; // мусор вместо JSON — копии нет (Р10а-7)
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const cartId: unknown = Reflect.get(parsed, 'cartId');
  const lines: unknown = Reflect.get(parsed, 'lines');
  if (typeof cartId !== 'string' || cartId === '' || !Array.isArray(lines)) return null;
  const copy: HandoffLine[] = [];
  for (const line of lines) {
    const parsedLine = handoffLineOf(line);
    if (parsedLine === null) return null;
    copy.push(parsedLine);
  }
  return { cartId, lines: copy };
}

export const readHandoff = (raw: string | null): Handoff | null => (raw === null ? null : handoffOf(raw));

// «Сайдбар» (cart-type не 'page') и на странице есть окно с open-on="cart-open" (Р10а-5).
export function drawerWanted(core: CoreHandle, doc: Document): boolean {
  const settings = core.config?.theme.settings;
  return settings?.['cart-type'] !== 'page' && doc.querySelector(DRAWER_SELECTOR) !== null;
}

// cart.open из скрипта и из разметки (Р10а-4, Р10а-5): отмена перехода — синхронно, до первого await.
export function openCart(rt: CartRuntime, event?: SectionEvent): Promise<Result<{ readonly drawer: boolean }>> {
  if (!drawerWanted(rt.core, document)) {
    if (event === undefined && rt.core.mode === 'live') navigation.go('/cart');
    return Promise.resolve({ ok: true, data: { drawer: false } });
  }
  event?.preventDefault();
  rt.core.emit('merfy:cart:open', {});
  return Promise.resolve({ ok: true, data: { drawer: true } });
}

// cart.checkout из разметки: номер корзины и копия строк без подарка (Р10а-7).
const handoffJson = (cartId: string, lines: readonly CartLine[]): string => {
  const copy = lines
    .filter((line) => !line.gift)
    .map((line) => ({ productId: line.productId, variantId: line.variantId, quantity: line.quantity }));
  return JSON.stringify({ cartId, lines: copy });
};

// Задача в очереди: пусто (нет строк без подарка или номера) — invalid, перехода нет.
async function checkoutOnServer(rt: CartRuntime): Promise<Result<null>> {
  if (!rt.readDone) {
    const readFailure = await readCartInto(rt);
    if (readFailure !== null) {
      reportFailure(rt.core, readFailure);
      return failed(readFailure);
    }
  }
  const cartId = cartIdOf(rt.page);
  const lines = rt.state.get().lines.filter((line) => !line.gift);
  if (cartId === null || lines.length === 0) {
    const failure = failureOf('invalid', 'cart.checkout: корзина пуста');
    reportFailure(rt.core, failure);
    return failed(failure);
  }
  rt.page.setItem(CHECKOUT_CART_KEY, cartId);
  rt.page.setItem(HANDOFF_KEY, handoffJson(cartId, lines));
  navigation.go('/checkout');
  return { ok: true, data: null };
}

// cart.checkout из скрипта и из разметки (Р10а-7): в превью — ничего, на витрине переход после записи ключей.
export async function checkoutCart(rt: CartRuntime, event?: SectionEvent): Promise<Result<null>> {
  if (rt.core.mode === 'preview') return { ok: true, data: null };
  event?.preventDefault();
  return rt.enqueue(() => checkoutOnServer(rt));
}

// Статус ответа: 404 — not_found; данные не по форме — null (сбой — wait).
function statusOf(reply: Reply): string | null {
  if (reply.status === 404) return 'not_found';
  if (typeof reply.body !== 'object' || reply.body === null) return null;
  const data: unknown = Reflect.get(reply.body, 'data');
  if (typeof data !== 'object' || data === null) return null;
  const status: unknown = Reflect.get(data, 'status');
  return typeof status === 'string' ? status : null;
}

const verdictOf = (reply: Reply): Verdict => {
  const status = statusOf(reply);
  return status === null ? 'wait' : (PAYMENT_VERDICT[status] ?? 'wait');
};

// Оплачено: запись и копия стёрты; номер SDK равен заказу — стёрт, корзина пустая (Р10а-8).
function settlePaid(rt: CartRuntime, orderId: string): void {
  rt.page.removeItem(HANDOFF_KEY);
  if (cartIdOf(rt.page) !== orderId) return;
  rt.page.removeItem(CART_ID_KEY);
  markRead(rt, []);
}

// Не оплачено: копия того же заказа становится новой корзиной; ошибка запроса — строка в консоль, дальше не идёт.
async function cartFromCopy(rt: CartRuntime, conf: CartApi, copy: Handoff): Promise<void> {
  const created = await createCart(conf);
  if (created.kind === 'failure') {
    console.error(`cart: возврат корзины после отказа оплаты — статус ${created.failure.code}`);
    return;
  }
  rt.page.setItem(CART_ID_KEY, created.id);
  for (const line of copy.lines) {
    const body = line.variantId === null
      ? { product_id: line.productId, quantity: line.quantity }
      : { product_id: line.productId, quantity: line.quantity, variant_id: line.variantId };
    const added = await addItem(conf, created.id, body);
    if (added.kind === 'failure') {
      console.error(`cart: возврат строки корзины после отказа оплаты — ${added.failure.code}`);
      return;
    }
  }
  await readCartInto(rt);
}

// Не оплачено: запись стёрта; копия с cartId заказа — новая корзина (Р10а-8).
async function settleAbandoned(rt: CartRuntime, orderId: string): Promise<void> {
  const copy = readHandoff(rt.page.getItem(HANDOFF_KEY));
  if (copy === null || copy.cartId !== orderId) return;
  rt.page.removeItem(HANDOFF_KEY);
  const conf = apiOf(rt.core);
  if (conf === null) return;
  await cartFromCopy(rt, conf, copy);
}

// Одна проверка: orderId из записи; пока шёл запрос, запись сменилась — ничего.
async function checkPendingOrder(rt: CartRuntime): Promise<void> {
  const raw = rt.page.getItem(PENDING_ORDER_KEY);
  if (raw === null) return;
  const orderId = orderIdOf(raw);
  if (orderId === null) {
    rt.page.removeItem(PENDING_ORDER_KEY);
    return;
  }
  const conf = apiOf(rt.core);
  if (conf === null) return;
  const reply = await requestJson(`${conf.url}/orders/${orderId}/payment-status`, { method: 'GET' });
  if (rt.page.getItem(PENDING_ORDER_KEY) !== raw) return;
  const verdict = verdictOf(reply);
  if (verdict === 'wait') return;
  rt.page.removeItem(PENDING_ORDER_KEY);
  if (verdict === 'paid') return settlePaid(rt, orderId);
  await settleAbandoned(rt, orderId);
}

// Запись без orderId — мусор, стёрта.
function orderIdOf(raw: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null; // мусор вместо JSON — записи нет
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const orderId: unknown = Reflect.get(parsed, 'orderId');
  return typeof orderId === 'string' && orderId !== '' ? orderId : null;
}

// Заказ после оплаты (Р10а-8): проверка сейчас и по каждому merfy:page:visible на document. Только на витрине;
// одновременно — не больше одной проверки.
export function watchPendingOrder(rt: CartRuntime): void {
  if (rt.page.getItem(PENDING_ORDER_KEY) === null) return;
  let busy = false;
  const stop = (): void => {
    if (rt.page.getItem(PENDING_ORDER_KEY) === null) document.removeEventListener('merfy:page:visible', onVisible);
  };
  const onVisible = (): void => check();
  const check = (): void => {
    if (busy) return;
    busy = true;
    void rt
      .enqueue(() => checkPendingOrder(rt))
      .catch((error: unknown) => {
        console.error(`cart: проверка оплаты заказа — ${String(error)}`);
      })
      .finally(() => {
        busy = false;
        stop();
      });
  };
  document.addEventListener('merfy:page:visible', onVisible);
  check();
}

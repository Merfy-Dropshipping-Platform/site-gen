import { dropToken, tokenOf } from '../customer-token';
import { type Failure, type Reply, failed, failureOf, reasonOf, reportFailure } from '../failures';
import { requestJson } from '../requests';
import { pageStorage, type KeyValue } from '../storage';
import type {
  ActionOptions,
  CoreHandle,
  Money,
  Order,
  OrderLine,
  OrderSummary,
  OrdersModule,
  Result,
  SdkPart,
} from '../types';

// Заказы покупательницы (блок 10 «Секций и SDK», 10.8, «Решил сам» п. 20; часть 10в, Р10в-7, Р10в-8): /store/orders
// шлюза с токеном; вид заказа — как у страницы заказа flux; «Отменить» — по стадии заказа и правилу перевозчика.

export const ORDERS_TAKE = 50;
export const ORDER_MISSING_TEXT = 'Заказ не найден';
// Подписи статусов — как у страницы заказа flux.
export const STATUS_TEXT: Readonly<Record<string, string>> = {
  cart: 'Корзина',
  pending: 'Ожидает оплаты',
  paid: 'Оплачен',
  processing: 'В сборке',
  sent: 'Отправлен',
  delivered: 'Доставлен',
  cancelled: 'Отменён',
  refunded: 'Возврат',
};

// Статусы отправления «груз ещё у продавца» — зеркало orders (src/delivery/shipment-status.ts, BEFORE_HANDOVER).
const BEFORE_HANDOVER = new Set(['REGISTERING', 'REGISTRATION_FAILED', 'CREATED']);

// Покупательница может сама отменить отправление — копия customerMayCancelShipment (theme-base/runtime/order-delivery.ts):
// решает перевозчик (shipmentCancellable), а пока его слова нет — по статусу отправления (груз ещё не передан).
export function shipmentCancellable(order: {
  readonly shipmentCancellable?: unknown;
  readonly deliveryStatus?: unknown;
}): boolean {
  if (typeof order.shipmentCancellable === 'boolean') return order.shipmentCancellable;
  const status = order.deliveryStatus;
  return status == null || (typeof status === 'string' && BEFORE_HANDOVER.has(status));
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const textOf = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

// Адрес «город, улица, д. N»; нет адреса доставки — пункт выдачи; нет и его — null.
function addressOf(raw: unknown): string | null {
  if (!isRecord(raw)) return null;
  const parts = [textOf(raw.city), textOf(raw.street), buildingOf(raw.building)];
  const present = parts.filter((part): part is string => part !== null);
  return present.length === 0 ? null : present.join(', ');
}

const buildingOf = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? `д. ${value}` : null;

// Варианты строки: объект «имя группы → значение»; нет или не по форме — пустые.
function optionsOf(raw: unknown): Readonly<Record<string, string>> {
  if (!isRecord(raw)) return {};
  const options: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') options[key] = value;
  }
  return options;
}

// Сумма из ответа: totalCents; нет или не число — null.
const totalOf = (raw: unknown, currency: string): Money | null =>
  typeof raw === 'number' ? { amount: raw, currency } : null;

// Строка заказа (факт 23): name, imageUrl, options, quantity, totalCents, isBonus; не по форме — null.
function lineOf(raw: unknown, currency: string): OrderLine | null {
  if (
    !isRecord(raw) ||
    typeof raw.name !== 'string' ||
    typeof raw.quantity !== 'number' ||
    typeof raw.totalCents !== 'number'
  )
    return null;
  return {
    title: raw.name,
    image: textOf(raw.imageUrl),
    options: optionsOf(raw.options),
    quantity: raw.quantity,
    total: { amount: raw.totalCents, currency },
    gift: raw.isBonus === true,
  };
}

// Сводка заказа: номер, дата, статус и подпись, сумма.
function summaryOf(raw: Readonly<Record<string, unknown>>, currency: string): OrderSummary {
  const status = typeof raw.status === 'string' ? raw.status : '';
  return {
    number: String(raw.orderNumber),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
    status,
    statusText: STATUS_TEXT[status] ?? status,
    total: totalOf(raw.totalCents, currency),
  };
}

// Заказ из ответа шлюза: сводка + строки, адрес и «Отменить»; не по форме — null → server.
export function orderOf(raw: unknown, currency: string): Order | null {
  if (!isRecord(raw) || typeof raw.orderNumber !== 'string' || raw.orderNumber === '') return null;
  if (!Array.isArray(raw.items)) return null;
  const lines: OrderLine[] = [];
  for (const item of raw.items) {
    const line = lineOf(item, currency);
    if (line === null) return null;
    lines.push(line);
  }
  const summary = summaryOf(raw, currency);
  const stage = summary.status === 'paid' || summary.status === 'processing';
  return {
    ...summary,
    lines,
    address: addressOf(raw.shippingAddress) ?? textOf(raw.pickupPointAddress),
    canCancel: stage && shipmentCancellable(raw),
  };
}

interface ShopApi {
  readonly url: string;
  readonly storeId: string;
  readonly currency: string;
}

const shopApiOf = (core: CoreHandle): ShopApi | null => {
  const config = core.config;
  if (config === null) return null;
  return { url: config.api.url, storeId: config.shop.id, currency: config.currency };
};

// Договор RPC платформы: успех — любой 2xx с success: true (шлюз отвечает POST-ам 201, проверка dev 25.10).
const isOkReply = (reply: Reply): boolean => {
  const body = reply.body;
  return reply.status >= 200 && reply.status < 300 && typeof body === 'object' && body !== null && Reflect.get(body, 'success') === true;
};

const dataOf = (reply: Reply): unknown => {
  const body = reply.body;
  return typeof body === 'object' && body !== null ? Reflect.get(body, 'data') : undefined;
};

// 404 — заказа с этим номером нет (Р10в-7); его текст — наш, не сервера.
const missingFailure = (): Failure => ({ code: 'refused', message: ORDER_MISSING_TEXT, notice: ORDER_MISSING_TEXT });

interface OrdersRuntime {
  readonly core: CoreHandle;
  readonly conf: ShopApi | null;
  readonly page: KeyValue;
}

// 404 — заказа нет; 401 при сохранённом токене — токен удалён, merfy:auth:signout, отказ unauthorized (таблица кодов 10).
function replyFailure(rt: OrdersRuntime, reply: Reply, author: string): Failure {
  if (reply.status === 404) return missingFailure();
  if (reasonOf(reply) === 'unauthorized') {
    dropToken(rt.page);
    rt.core.emit('merfy:auth:signout', {});
    return failureOf('unauthorized', author);
  }
  return failureOf(reasonOf(reply), author, reply);
}

// Общий отказ: токена нет или шлюз не принял — без запроса или после 401.
function failWith(rt: OrdersRuntime, failure: Failure, options?: ActionOptions): Result<never> {
  reportFailure(rt.core, failure, options);
  return failed(failure);
}

// Гостья без токена: unauthorized без запроса (Р10в-7).
function guestFailure(rt: OrdersRuntime, author: string, options?: ActionOptions): Result<never> {
  return failWith(rt, failureOf('unauthorized', author), options);
}

// Массив неизвестной формы: Array.isArray на unknown сужает до any[], свой предикат — до readonly unknown[].
const isUnknownList = (value: unknown): value is readonly unknown[] => Array.isArray(value);

// Список из ответа: массив или { items } (Р10в-7).
function listItemsOf(reply: Reply): readonly unknown[] | null {
  if (!isOkReply(reply)) return null;
  const data: unknown = dataOf(reply);
  if (isUnknownList(data)) return data;
  const items: unknown = isRecord(data) ? data.items : null;
  return isUnknownList(items) ? items : null;
}

async function listOf(
  rt: OrdersRuntime,
  options?: ActionOptions,
): Promise<Result<{ readonly orders: readonly OrderSummary[] }>> {
  const conf = rt.conf;
  const token = tokenOf(rt.page);
  if (token === null || conf === null) return guestFailure(rt, 'orders.list: нет токена покупательницы', options);
  const params = new URLSearchParams({ store_id: conf.storeId, take: String(ORDERS_TAKE) });
  const reply = await requestJson(`${conf.url}/store/orders?${params.toString()}`, { method: 'GET', token });
  const items = listItemsOf(reply);
  if (items === null) return failWith(rt, replyFailure(rt, reply, 'orders.list: список заказов'), options);
  return { ok: true, data: { orders: items.map((item) => summaryOf(isRecord(item) ? item : {}, conf.currency)) } };
}

// Заказ из ответа get: не по форме — server, 404 — «Заказ не найден».
function orderResult(
  rt: OrdersRuntime,
  reply: Reply,
  author: string,
  options?: ActionOptions,
): Result<{ readonly order: Order }> {
  const order = isOkReply(reply) ? orderOf(dataOf(reply), rt.conf?.currency ?? 'RUB') : null;
  if (order !== null) return { ok: true, data: { order } };
  return failWith(rt, replyFailure(rt, reply, author), options);
}

async function getOf(
  rt: OrdersRuntime,
  args: { readonly number: string },
  options?: ActionOptions,
): Promise<Result<{ readonly order: Order }>> {
  const conf = rt.conf;
  const token = tokenOf(rt.page);
  if (token === null || conf === null) return guestFailure(rt, 'orders.get: нет токена покупательницы', options);
  const number = encodeURIComponent(args.number);
  const reply = await requestJson(`${conf.url}/store/orders/${number}`, { method: 'GET', token });
  return orderResult(rt, reply, 'orders.get: заказ по номеру', options);
}

async function cancelOf(
  rt: OrdersRuntime,
  args: { readonly number: string; readonly reason: string },
  options?: ActionOptions,
): Promise<Result<{ readonly order: Order }>> {
  const conf = rt.conf;
  const token = tokenOf(rt.page);
  if (args.reason.trim() === '')
    return failWith(rt, failureOf('invalid', 'orders.cancel: причина — непустая строка'), options);
  if (token === null || conf === null) return guestFailure(rt, 'orders.cancel: нет токена покупательницы', options);
  const number = encodeURIComponent(args.number);
  const reply = await requestJson(`${conf.url}/store/orders/${number}/cancel`, {
    method: 'POST',
    body: { reason: args.reason },
    token,
  });
  if (!isOkReply(reply)) return failWith(rt, replyFailure(rt, reply, 'orders.cancel: отмена заказа'), options);
  return getOf(rt, { number: args.number }, options);
}

export const orders: SdkPart<'orders', OrdersModule> = {
  name: 'orders',
  create: (core: CoreHandle): OrdersModule => {
    const rt: OrdersRuntime = { core, conf: shopApiOf(core), page: pageStorage(window, core.mode) };
    return {
      list: (options) => listOf(rt, options),
      get: (args, options) => getOf(rt, args, options),
      cancel: (args, options) => cancelOf(rt, args, options),
    };
  },
};

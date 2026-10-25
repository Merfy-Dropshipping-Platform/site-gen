import { messageOf } from '../../report';
import { changeInModule, removeInModule } from '../cart-change';
import { checkoutCart, openCart, watchPendingOrder } from '../cart-checkout';
import { previewCartStorage } from '../cart-preview';
import { withLine } from '../cart-lines';
import type { AddItemBody, AddedItem, CartApi, CreatedCart, ReadCart } from '../cart-server';
import { addItem, createCart, readCart } from '../cart-server';
import { type Failure, failed, failureOf, partialText, reportFailure, reportWarning } from '../failures';
import { pageStorage, type KeyValue } from '../storage';
import { type Atom, atom, batch, computed, onMount, readable } from '../stores';
import type {
  ActionOptions,
  CartLine,
  CartModule,
  CartState,
  CartTotals,
  CoreHandle,
  Money,
  Result,
  SdkPart,
} from '../types';

// Корзина на сервере (блок 9, часть 9а): $cart — ответ шлюза, $count — штуки плюс ждущие ответа, cart.add — по одному
// запросу в порядке нажатий. Номер — CART_ID_KEY в pageStorage (Р9а-15). Блок 10 (часть 10а): $totals и $total,
// cart.change и cart.remove — cart-change.ts.

export const CART_ID_KEY = 'merfy:cart-id:v1';
// Модуль → его состояние: действиям разметки open и checkout нужно событие нажатия и конфиг (Р10а-4).
const RUNTIMES = new WeakMap<CartModule, CartRuntime>();
export const REREAD_AFTER_MS = 30_000;

interface AddArgs {
  readonly productId: string;
  readonly variantId?: string;
  readonly quantity?: number;
}

interface ArgRule {
  readonly ok: (args: AddArgs) => boolean;
  readonly message: string;
}

// Общее состояние модуля корзины: сторы, очередь, хранилище номера и отметка чтения.
type SettledItem = Exclude<AddedItem, { readonly kind: 'missing' }>;

export interface CartRuntime {
  readonly core: CoreHandle;
  readonly state: Atom<CartState>;
  readonly totals: Atom<CartTotals>; // блок 10: итоги с сервера (Р10а-2)
  readonly adding: Atom<number>;
  readonly page: KeyValue;
  readonly enqueue: <T>(task: () => Promise<T>) => Promise<T>;
  readonly writeStores: (write: () => void) => void;
  readDone: boolean;
  readAt: number;
  totalsWatched: boolean; // на $totals или $total подписаны — после cart.add перечитать корзину
  readQueued: boolean; // чтение по подписке или событию страницы стоит в очереди и ещё не началось
}

const isText = (value: unknown): boolean => typeof value === 'string' && value !== '';
const isQuantity = (v: unknown): boolean => typeof v === 'number' && Number.isInteger(v) && v >= 1;
// Проверка аргументов cart.add — таблицей, по порядку (п. 3).
const ARG_RULES: readonly ArgRule[] = [
  { ok: (a) => isText(a.productId), message: 'cart.add: productId — непустая строка' },
  { ok: (a) => a.variantId === undefined || isText(a.variantId), message: 'cart.add: variantId — непустая строка' },
  { ok: (a) => a.quantity === undefined || isQuantity(a.quantity), message: 'cart.add: quantity — целое число от 1' },
];

const argProblem = (args: AddArgs): string | null => ARG_RULES.find((rule) => !rule.ok(args))?.message ?? null;
const countOfLines = (lines: readonly CartLine[]): number => lines.reduce((total, line) => total + line.quantity, 0);

const quantityFrom = (value: string | undefined): number | undefined =>
  value === undefined ? undefined : Number(value);

// Очередь: чтение и добавление по одному, в порядке вызова; ошибка задачи не рвёт цепочку (п. 4).
function createQueue(): CartRuntime['enqueue'] {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  };
}

// События страницы (Р9а-9): вкладку вернули позже REREAD_AFTER_MS, «Назад» из кеша, другая вкладка сменила номер.
function listenPage(rt: CartRuntime, reread: () => void): () => void {
  const signal = new AbortController();
  const onVisible = (): void => {
    if (document.visibilityState === 'visible' && Date.now() - rt.readAt > REREAD_AFTER_MS) reread();
  };
  const onRestore = (event: PageTransitionEvent): void => void (event.persisted ? reread() : undefined);
  const onStorage = (event: StorageEvent): void => void (event.key === CART_ID_KEY ? reread() : undefined);
  document.addEventListener('visibilitychange', onVisible, { signal: signal.signal });
  window.addEventListener('pageshow', onRestore, { signal: signal.signal });
  window.addEventListener('storage', onStorage, { signal: signal.signal });
  return () => signal.abort();
}

export const apiOf = (core: CoreHandle): CartApi | null => {
  const config = core.config;
  if (config === null) return null;
  return { url: config.api.url, storeId: config.shop.id, currency: config.currency };
};

export const cartIdOf = (page: KeyValue): string | null => page.getItem(CART_ID_KEY);

// Итоги без корзины: нули; ready — прочитаны ли.
export function emptyTotals(currency: string, ready: boolean): CartTotals {
  const zero: Money = { amount: 0, currency };
  return { ready, subtotal: zero, discount: zero, discountName: null, extensionDiscount: zero, total: zero };
}

// Строки прочитаны. totals: итоги того же ответа; null — ответ без итогов, прежние остаются; нет аргумента — корзины
// нет, итоги — нули.
export function markRead(rt: CartRuntime, lines: readonly CartLine[], totals?: CartTotals | null): null {
  rt.readDone = true;
  rt.readAt = Date.now();
  rt.writeStores(() => {
    rt.state.set({ ready: true, lines });
    if (totals === undefined) rt.totals.set(emptyTotals(rt.core.config?.currency ?? 'RUB', true));
    else if (totals !== null) rt.totals.set(totals);
  });
  return null;
}

// Чтение в очереди: подписки на $cart и $totals в одном запуске страницы и события страницы дают одно чтение, пока
// поставленное не началось.
export function queueRead(rt: CartRuntime): void {
  if (rt.readQueued) return;
  rt.readQueued = true;
  void rt.enqueue(() => {
    rt.readQueued = false;
    return readCartInto(rt);
  });
}

// Чтение корзины: 404 и cart_not_found — номер стёрт, пустая готовая; ошибка — Failure для вызвавшего (фон — Р9а-13).
export async function readCartInto(rt: CartRuntime): Promise<Failure | null> {
  const conf = apiOf(rt.core);
  if (conf === null) return failureOf('server', 'cart: конфиг витрины не прочитан');
  const id = cartIdOf(rt.page);
  if (id === null) return markRead(rt, []);
  const outcome: ReadCart = await readCart(conf, id);
  if (outcome.kind === 'missing') {
    rt.page.removeItem(CART_ID_KEY);
    return markRead(rt, []);
  }
  if (outcome.kind === 'failure') return outcome.failure;
  return markRead(rt, outcome.lines, outcome.totals);
}

const failAdd = (rt: CartRuntime, failure: Failure, n: number, options?: ActionOptions): Result<CartState> => {
  rt.writeStores(() => rt.adding.set(rt.adding.get() - n));
  reportFailure(rt.core, failure, options);
  return failed(failure);
};

// Успех: стор → событие → ответ; «сколько добавилось» — разница с прежним количеством строки (п. 8).
function finishAdd(rt: CartRuntime, outcome: SettledItem, n: number, options?: ActionOptions): Result<CartState> {
  if (outcome.kind === 'failure') return failAdd(rt, outcome.failure, n, options);
  const line = outcome.line;
  const previous = rt.state.get().lines.find((current) => current.id === line.id)?.quantity ?? 0;
  const added = line.quantity - previous;
  rt.writeStores(() => {
    rt.state.set({ ready: true, lines: withLine(rt.state.get().lines, line) });
    rt.adding.set(rt.adding.get() - n);
  });
  if (added <= 0) {
    const failure = failureOf('stock-limit', '');
    reportFailure(rt.core, failure, options);
    return failed(failure);
  }
  rt.core.emit('merfy:cart:add', {
    lineId: line.id,
    productId: line.productId,
    variantId: line.variantId,
    quantity: added,
    price: line.price,
  });
  if (added < n) reportWarning(rt.core, partialText(added), options);
  return { ok: true, data: rt.state.get() };
}

const itemBodyOf = (args: AddArgs, n: number): AddItemBody =>
  args.variantId === undefined
    ? { product_id: args.productId, quantity: n }
    : { product_id: args.productId, quantity: n, variant_id: args.variantId };

async function retryOnNewCart(rt: CartRuntime, conf: CartApi, args: AddArgs, n: number): Promise<SettledItem> {
  const created: CreatedCart = await createCart(conf);
  if (created.kind === 'failure') return { kind: 'failure', failure: created.failure };
  rt.page.setItem(CART_ID_KEY, created.id);
  const outcome = await addItem(conf, created.id, itemBodyOf(args, n));
  return outcome.kind === 'missing' ? { kind: 'failure', failure: failureOf('server', '') } : outcome;
}

// Номер из хранилища или новая корзина; cart_not_found с сохранённым номером — номер стёрт и повтор один раз (п. 5).
async function postItem(rt: CartRuntime, conf: CartApi, args: AddArgs, n: number): Promise<SettledItem> {
  const storedId = cartIdOf(rt.page);
  const fresh: CreatedCart = storedId === null ? await createCart(conf) : { kind: 'id', id: storedId };
  if (fresh.kind === 'failure') return { kind: 'failure', failure: fresh.failure };
  if (storedId === null) rt.page.setItem(CART_ID_KEY, fresh.id);
  const outcome = await addItem(conf, fresh.id, itemBodyOf(args, n));
  if (outcome.kind !== 'missing') return outcome;
  if (storedId === null) return { kind: 'failure', failure: failureOf('server', '') };
  rt.page.removeItem(CART_ID_KEY);
  markRead(rt, []);
  return retryOnNewCart(rt, conf, args, n);
}

// Задача добавления в очереди: сначала чтение непрочитанной корзины, потом запросы шлюза (п. 3).
async function addOnServer(
  rt: CartRuntime,
  args: AddArgs,
  n: number,
  options?: ActionOptions,
): Promise<Result<CartState>> {
  const conf = apiOf(rt.core);
  if (conf === null) return failAdd(rt, failureOf('server', 'cart: конфиг витрины не прочитан'), n, options);
  if (!rt.readDone) {
    const readFailure = await readCartInto(rt);
    if (readFailure !== null) return failAdd(rt, readFailure, n, options);
  }
  const outcome = await postItem(rt, conf, args, n);
  const result = finishAdd(rt, outcome, n, options);
  // Итогов в ответе добавления нет: пока на $totals подписаны — перечитать корзину следом (Р10а-2).
  if (rt.totalsWatched) void rt.enqueue(() => readCartInto(rt));
  return result;
}

const addInModule =
  (rt: CartRuntime) =>
  async (args: AddArgs, options?: ActionOptions): Promise<Result<CartState>> => {
    const problem = argProblem(args);
    if (problem !== null) {
      const failure = failureOf('invalid', problem);
      reportFailure(rt.core, failure, options);
      return failed(failure);
    }
    if (apiOf(rt.core) === null) {
      const failure = failureOf('server', 'cart.add: конфиг витрины не прочитан');
      reportFailure(rt.core, failure, options);
      return failed(failure);
    }
    const n = args.quantity ?? 1;
    rt.writeStores(() => rt.adding.set(rt.adding.get() + n));
    return rt.enqueue(() => addOnServer(rt, args, n, options));
  };

// Запись в сторы — одним batch: $cart и $adding меняются вместе; ошибка подписчика — строкой в консоль (Р9а-11).
function writeStoresOf(): CartRuntime['writeStores'] {
  return (write) => {
    try {
      batch(write);
    } catch (error) {
      console.error(`Подписчик стора корзины: ${messageOf(error)}`);
    }
  };
}

// Первая подписка на сторы: $cart и $count — чтение непрочитанной корзины и слушатели страницы (Р9а-9); $totals и
// $total — чтение итогов, отметка «подписаны» — до отключения стора (Р10а-2).
function mountStores(rt: CartRuntime, state: Atom<CartState>, totals: Atom<CartTotals>): void {
  onMount(state, () => {
    const reread = (): void => queueRead(rt);
    if (!rt.readDone && rt.core.config !== null) reread();
    return listenPage(rt, reread);
  });
  onMount(totals, () => {
    rt.totalsWatched = true;
    if (!totals.get().ready && rt.core.config !== null) queueRead(rt);
    return () => {
      rt.totalsWatched = false;
    };
  });
}

// Память страницы корзины: в превью номер корзины приходит из адреса рамки и уходит конструктору (Р10а-9).
function pageOf(core: CoreHandle): KeyValue {
  const base = pageStorage(window, core.mode);
  return core.mode === 'preview' ? previewCartStorage(base, window, CART_ID_KEY) : base;
}

// Общее состояние модуля: сторы, очередь и хранилище номера.
function runtimeOf(
  core: CoreHandle,
  state: Atom<CartState>,
  totals: Atom<CartTotals>,
  adding: Atom<number>,
): CartRuntime {
  return {
    core,
    state,
    totals,
    totalsWatched: false,
    readQueued: false,
    adding,
    page: pageOf(core),
    enqueue: createQueue(),
    writeStores: writeStoresOf(),
    readDone: false,
    readAt: 0,
  };
}

export const cart: SdkPart<'cart', CartModule> = {
  name: 'cart',
  create: (core: CoreHandle): CartModule => {
    const state = atom<CartState>({ ready: false, lines: [] });
    const totals = atom<CartTotals>(emptyTotals(core.config?.currency ?? 'RUB', false));
    const total = computed(totals, (value) => value.total);
    const adding = atom(0);
    const count = computed([state, adding], (cartState, waiting) => countOfLines(cartState.lines) + waiting);
    const rt = runtimeOf(core, state, totals, adding);
    mountStores(rt, state, totals);
    if (core.mode === 'live') watchPendingOrder(rt);
    const module: CartModule = {
      $cart: readable(state),
      $count: readable(count),
      $totals: readable(totals),
      $total: readable(total),
      add: addInModule(rt),
      change: changeInModule(rt),
      remove: removeInModule(rt),
      open: () => openCart(rt),
      checkout: () => checkoutCart(rt),
    };
    RUNTIMES.set(module, rt);
    return module;
  },
  markup: {
    add: {
      params: ['product-id', 'variant-id', 'quantity'],
      call: (api: CartModule, values): Promise<Result<unknown>> =>
        api.add({
          productId: values['product-id'] ?? '',
          ...(values['variant-id'] === undefined ? {} : { variantId: values['variant-id'] }),
          ...(values.quantity === undefined ? {} : { quantity: quantityFrom(values.quantity) }),
        }),
    },
    change: {
      params: ['line-id', 'quantity'],
      call: (api: CartModule, values): Promise<Result<unknown>> =>
        api.change({ lineId: values['line-id'] ?? '', quantity: Number(values.quantity ?? '') }),
    },
    remove: {
      params: ['line-id'],
      call: (api: CartModule, values): Promise<Result<unknown>> => api.remove({ lineId: values['line-id'] ?? '' }),
    },
    // Разметка передаёт событие нажатия: отмена перехода по ссылке — синхронно (Р10а-4).
    open: {
      params: [],
      call: (api: CartModule, _values, event): Promise<Result<unknown>> => {
        const rt = RUNTIMES.get(api);
        return rt === undefined ? api.open() : openCart(rt, event);
      },
    },
    checkout: {
      params: [],
      call: (api: CartModule, _values, event): Promise<Result<unknown>> => {
        const rt = RUNTIMES.get(api);
        return rt === undefined ? api.checkout() : checkoutCart(rt, event);
      },
    },
  },
};

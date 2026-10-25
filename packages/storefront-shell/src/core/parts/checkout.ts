import { requestJson } from '../requests';
import type { CoreHandle, SdkPart } from '../types';

// window.cartStore для нынешнего оформления (блок 10, 10.5, «Решил сам» п. 10; часть 10а, Р10а-10). Строки — как их
// отдаёт шлюз (items ответа GET /store/carts/:id), деньги — копейки. Номер — merfy:cartId, без него — merfy:cart-id:v1.

export const CART_UPDATED_EVENT = 'cart:updated';
const CART_ID_KEYS = ['merfy:cartId', 'merfy:cart-id:v1'] as const;

export interface CheckoutCartStore {
  getItems(): readonly unknown[]; // items последнего ответа; до ответа — []
  getTotal(): number; // Σ unitPriceCents × quantity, как у пяти тем
  getServerCart(): { readonly discountCents: number; readonly items: readonly unknown[] } | null;
  getCartId(): string | null;
  refresh(): Promise<void>; // GET и cart:updated
  syncToServer(options?: { readonly notify?: boolean }): Promise<string | null>; // строк нет — null; иначе GET, номер
  syncFromCartData(data: unknown): void; // { items } или { cart, items } — как у пяти тем; иное — строк нет
  setLocalItems(items: unknown): void; // массив — он, иначе []; cart:updated
  clear(): void; // строки и снимок пусты, cart:updated; ключи браузера не трогает — их стирает оформление
}

interface ServerSnapshot {
  readonly discountCents: number;
  readonly items: readonly unknown[];
}

// Изменяемое состояние объекта: строки последнего ответа и снимок сервера.
interface StoreState {
  lines: readonly unknown[];
  snapshot: ServerSnapshot | null;
}

const isCartId = (value: string | null): value is string => value !== null;

const numberOrZero = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

// Копия строк ответа: данные приходят с сервера и уходят в оформление — своя копия, а не ссылка на ответ.
const copyItems = (items: readonly unknown[]): readonly unknown[] => structuredClone(items);

const centsOf = (item: unknown): number => {
  if (typeof item !== 'object' || item === null) return 0;
  return numberOrZero(Reflect.get(item, 'unitPriceCents')) * numberOrZero(Reflect.get(item, 'quantity'));
};

// { items } или { cart, items }: скидка — cart.discountCents ?? discountCents ?? 0; иное — строк нет.
function snapshotOf(data: unknown): { readonly snapshot: ServerSnapshot | null; readonly items: readonly unknown[] } {
  if (typeof data !== 'object' || data === null) return { snapshot: null, items: [] };
  const raw: unknown = Reflect.get(data, 'items');
  if (!Array.isArray(raw)) return { snapshot: null, items: [] };
  const cart: unknown = Reflect.get(data, 'cart');
  const fromCart: unknown = typeof cart === 'object' && cart !== null ? Reflect.get(cart, 'discountCents') : undefined;
  const discount = fromCart === undefined ? numberOrZero(Reflect.get(data, 'discountCents')) : numberOrZero(fromCart);
  const items = copyItems(raw);
  return { snapshot: { discountCents: discount, items }, items };
}

// Номер корзины: merfy:cartId, без него — merfy:cart-id:v1.
const cartIdOf = (storage: Pick<Storage, 'getItem'>): string | null =>
  CART_ID_KEYS.map((key) => storage.getItem(key)).find(isCartId) ?? null;

// Одно чтение: номер есть — GET и строки по ответу (сбой сети — прежние строки); номера нет — пусто.
async function loadCart(apiUrl: string, storage: Pick<Storage, 'getItem'>, state: StoreState): Promise<void> {
  const id = cartIdOf(storage);
  if (id === null) {
    state.lines = [];
    state.snapshot = null;
    return;
  }
  const reply = await requestJson(`${apiUrl}/store/carts/${id}`, { method: 'GET' });
  if (reply.status === 0) return;
  const parsed = snapshotOf(reply.body);
  state.lines = parsed.items;
  state.snapshot = parsed.snapshot;
}

// Дедупликация чтения: два syncToServer сразу ждут один запрос (как у пяти тем).
function createLoader(
  apiUrl: string,
  storage: Pick<Storage, 'getItem'>,
  state: StoreState,
): (notifyDone: () => void) => Promise<void> {
  let inFlight: Promise<void> | null = null;
  return async (notifyDone: () => void): Promise<void> => {
    if (inFlight !== null) {
      await inFlight;
      return;
    }
    inFlight = loadCart(apiUrl, storage, state);
    try {
      await inFlight;
    } finally {
      inFlight = null;
    }
    notifyDone();
  };
}

// Строки из ответа промокода или с оформления: { items } или { cart, items }; иное — строк нет.
function applyData(state: StoreState, data: unknown, notify: () => void): void {
  const parsed = snapshotOf(data);
  state.lines = parsed.items;
  state.snapshot = parsed.snapshot;
  notify();
}

// Методы объекта поверх общего состояния: чтения — через load, изменения — сразу событие cart:updated.
function storeOf(
  state: StoreState,
  storage: Pick<Storage, 'getItem'>,
  load: (notifyDone: () => void) => Promise<void>,
  notify: () => void,
): CheckoutCartStore {
  return {
    getItems: () => state.lines,
    getTotal: (): number => state.lines.reduce<number>((total, item) => total + centsOf(item), 0),
    getServerCart: () => state.snapshot,
    getCartId: () => cartIdOf(storage),
    // refresh — чтение и cart:updated; syncToServer — чтение молча, событие только при notify.
    refresh: async (): Promise<void> => {
      await load(notify);
    },
    syncToServer: async (options): Promise<string | null> => {
      if (state.lines.length === 0) return null;
      await load((): void => undefined);
      if (options?.notify === true) notify();
      return cartIdOf(storage);
    },
    syncFromCartData: (data: unknown): void => applyData(state, data, notify),
    setLocalItems: (items: unknown): void => {
      state.lines = Array.isArray(items) ? copyItems(items) : [];
      notify();
    },
    clear: (): void => applyData(state, null, notify),
  };
}

export function createCheckoutStore(
  apiUrl: string,
  storage: Pick<Storage, 'getItem'>,
  doc: Document,
): CheckoutCartStore {
  const state: StoreState = { lines: [], snapshot: null };
  const notify = (): void => {
    doc.dispatchEvent(new CustomEvent(CART_UPDATED_EVENT, { detail: { items: state.lines } }));
  };
  const load = createLoader(apiUrl, storage, state);
  return storeOf(state, storage, load, notify);
}

// create: только на витрине (mode 'live') — window.cartStore = createCheckoutStore(...) и refresh(); в превью — ничего.
export const checkout: SdkPart<'checkout', null> = {
  name: 'checkout',
  create: (core: CoreHandle): null => {
    if (core.mode !== 'live' || core.config === null) return null;
    const store = createCheckoutStore(core.config.api.url, window.localStorage, window.document);
    Reflect.set(window, 'cartStore', store);
    void store.refresh();
    return null;
  },
};

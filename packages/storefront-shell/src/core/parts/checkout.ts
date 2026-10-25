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
// Настройки формы оформления (блок 10, часть 10а, факт 33) — тоже здесь: у пяти тем их тянет скрипт страницы
// (themes/flux/src/pages/checkout.astro); исходники новой темы сторож рендера от сети держит чистыми — код сети в ядре.
export const checkout: SdkPart<'checkout', null> = {
  name: 'checkout',
  create: (core: CoreHandle): null => {
    if (core.mode !== 'live' || core.config === null) return null;
    const store = createCheckoutStore(core.config.api.url, window.localStorage, window.document);
    Reflect.set(window, 'cartStore', store);
    void store.refresh();
    void loadCheckoutSettings(core.config.api.url, core.config.shop.id, window, window.document);
    return null;
  },
};

// Событие готовности настроек: его ждут блоки формы (CheckoutSubmit и другие), пока его нет — submit заблокирован.
export const CONFIG_READY_EVENT = 'checkout:config-ready';
const AUTH_TOKEN_KEY = 'merfy_customer_token';

// Окно настроек оформления; в тестах — поддельное (адрес не переключаем по-настоящему).
export interface SettingsWindow {
  readonly self: unknown;
  readonly top: unknown;
  readonly localStorage: Pick<Storage, 'getItem'>;
  location: { href: string };
}

// Поле объекта; не объект — undefined.
const fieldOf = (source: unknown, key: string): unknown =>
  typeof source === 'object' && source !== null ? Reflect.get(source, key) : undefined;

const oneOf = (value: unknown, allowed: readonly string[], fallback: string): string =>
  typeof value === 'string' && allowed.includes(value) ? value : fallback;

export interface CheckoutFormConfig {
  readonly contactMethod: string;
  readonly customerNameMode: string;
  readonly addressRequired: boolean;
  readonly requireCustomerAuth: boolean;
}

// Дефолты — как у пяти тем: полная форма; обязательный вход — только явным флагом (fail-open, любой сбой — гость идёт дальше).
export function checkoutFormConfigOf(settings: unknown): CheckoutFormConfig {
  return {
    contactMethod: oneOf(fieldOf(settings, 'contactMethod'), ['email', 'email-phone'], 'email-phone'),
    customerNameMode: oneOf(fieldOf(settings, 'customerNameMode'), ['surname', 'name', 'name-surname'], 'name-surname'),
    addressRequired: fieldOf(settings, 'addressRequired') !== false,
    requireCustomerAuth: fieldOf(settings, 'requireCustomerAuth') === true,
  };
}

// Настройки — в window.__MERFY_CONFIG__.checkout и событием checkout:config-ready (факт 33). Конфиг уже есть (превью
// отдало его сервером) — только событие, чужие поля не трогаем. Гость магазина с обязательным входом — на /login:
// настоящий барьер серверный (orders, 403), это только UX. Превью (рамка) адрес не переключает.
export function publishCheckoutSettings(
  settings: unknown,
  win: SettingsWindow,
  doc: Pick<Document, 'dispatchEvent'>,
  winRef: object,
): void {
  const config = checkoutFormConfigOf(settings);
  const existing: unknown = Reflect.get(winRef, '__MERFY_CONFIG__');
  const holder = typeof existing === 'object' && existing !== null ? existing : {};
  if (fieldOf(holder, 'checkout') !== undefined) {
    doc.dispatchEvent(new CustomEvent(CONFIG_READY_EVENT));
    return;
  }
  Reflect.set(holder, 'checkout', config);
  if (typeof existing !== 'object' || existing === null) Reflect.set(winRef, '__MERFY_CONFIG__', holder);
  const guest = win.localStorage.getItem(AUTH_TOKEN_KEY) === null;
  if (win.self === win.top && config.requireCustomerAuth && guest) {
    win.location.href = `/login?redirect=${encodeURIComponent('/checkout')}`;
    return;
  }
  doc.dispatchEvent(new CustomEvent(CONFIG_READY_EVENT));
}

// Настройки из шлюза при открытии оформления: сбой сети и пустой shopId — дефолты, событие всё равно диспатчится.
export async function loadCheckoutSettings(
  apiUrl: string,
  shopId: string,
  win: SettingsWindow,
  doc: Pick<Document, 'dispatchEvent'>,
): Promise<void> {
  const settings =
    shopId === '' ? null : await settingsReply(apiUrl, shopId).catch((): null => null);
  publishCheckoutSettings(settings, win, doc, win);
}

async function settingsReply(apiUrl: string, shopId: string): Promise<unknown> {
  const reply = await requestJson(`${apiUrl}/public/sites/${encodeURIComponent(shopId)}/settings`, {
    method: 'GET',
  });
  return reply.status === 0 ? null : fieldOf(reply.body, 'settings');
}

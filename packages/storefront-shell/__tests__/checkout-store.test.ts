import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONFIG_READY_EVENT,
  CART_UPDATED_EVENT,
  checkout,
  createCheckoutStore,
  loadCheckoutSettings,
  publishCheckoutSettings,
  type SettingsWindow,
} from '../src/core/parts/checkout';
import { API_URL, SHOP_ID, fakeCore, fakeGateway, serverItem } from './sdk-support';

// window.cartStore поверх корзины SDK для нынешнего оформления (блок 10 «Секций и SDK», 10.5, «Решил сам» п. 10; часть
// 10а, Р10а-10). Договор — исходники блоков оформления theme-base: каждый метод, который они зовут, есть у объекта.
// Поправка 25.10, 13:32: тест идёт в jsdom, где Vite подменяет new URL('..', import.meta.url) на /@fs/… — путь через
// dirname/join, как в соседних тестах.
const BLOCKS = join(dirname(fileURLToPath(import.meta.url)), '../../theme-base/');
const CHECKOUT_FILES = [
  'blocks/CheckoutSubmit/CheckoutSubmit.astro',
  'blocks/CheckoutTotals/CheckoutTotals.astro',
  'blocks/CheckoutOrderSummary/CheckoutOrderSummary.astro',
  'blocks/CheckoutDeliveryMethod/CheckoutDeliveryMethod.astro',
  'runtime/extension-points.ts',
];
const CART = { id: 'c-1', subtotalCents: 747000, discountCents: 74700, totalCents: 672300, promoCode: 'AUTO:Осень' };
const items = [serverItem('l-1', 'p12', 2), serverItem('l-2', 'p7', 1, 'v-red')];

const keyStorage = (values: Record<string, string>) => ({ getItem: (key: string) => values[key] ?? null });
const updates = () => {
  const seen: unknown[] = [];
  document.addEventListener(CART_UPDATED_EVENT, (event) =>
    seen.push(event instanceof CustomEvent ? event.detail : null),
  );
  return seen;
};

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'cartStore');
});

describe('window.cartStore', () => {
  it('договор: методы, которые зовут блоки оформления, — все есть', () => {
    const store = createCheckoutStore(API_URL, keyStorage({}), document);
    const called = new Set(
      CHECKOUT_FILES.flatMap((file) =>
        [...readFileSync(`${BLOCKS}${file}`, 'utf8').matchAll(/cartStore\??\.([a-zA-Z]+)|store\.(getServerCart)/g)].map(
          (match) => match[1] ?? match[2] ?? '',
        ),
      ),
    );
    expect([...called].sort()).toEqual(['getItems', 'getServerCart', 'getTotal', 'syncFromCartData', 'syncToServer']);
    expect([...called].filter((name) => typeof Reflect.get(store, name) !== 'function')).toEqual([]);
    expect(
      ['getCartId', 'setLocalItems', 'refresh', 'clear'].every(
        (name) => typeof Reflect.get(store, name) === 'function',
      ),
    ).toBe(true);
  });

  it('refresh: строки и снимок сервера — из GET по merfy:cartId; сумма — копейки; cart:updated', async () => {
    const gateway = fakeGateway();
    gateway.answer('GET /store/carts/c-1', { status: 200, body: { cart: CART, items } });
    const seen = updates();
    const store = createCheckoutStore(
      API_URL,
      keyStorage({ 'merfy:cartId': 'c-1', 'merfy:cart-id:v1': 'c-0' }),
      document,
    );
    await store.refresh();
    expect(store.getItems()).toEqual(items);
    expect(store.getTotal()).toBe(747000);
    expect(store.getServerCart()).toEqual({ discountCents: 74700, items });
    expect(store.getCartId()).toBe('c-1');
    expect(seen).toEqual([{ items }]);
  });

  it('номер — из merfy:cart-id:v1, когда merfy:cartId нет; номера нет — строк нет, запросов нет', async () => {
    const gateway = fakeGateway();
    gateway.answer('GET /store/carts/c-0', { status: 200, body: { cart: CART, items } });
    const store = createCheckoutStore(API_URL, keyStorage({ 'merfy:cart-id:v1': 'c-0' }), document);
    await store.refresh();
    expect(store.getItems()).toHaveLength(2);
    const empty = createCheckoutStore(API_URL, keyStorage({}), document);
    await empty.refresh();
    expect([empty.getItems(), empty.getServerCart(), gateway.keys()]).toEqual([[], null, ['GET /store/carts/c-0']]);
  });

  it('syncToServer: новую корзину не создаёт — свежий GET и номер; два вызова — один запрос; пусто — null', async () => {
    const gateway = fakeGateway();
    const reply = { status: 200, body: { cart: CART, items } };
    gateway.answer('GET /store/carts/c-1', reply, reply);
    const store = createCheckoutStore(API_URL, keyStorage({ 'merfy:cartId': 'c-1' }), document);
    await store.refresh();
    const seen = updates();
    expect(await Promise.all([store.syncToServer({ notify: true }), store.syncToServer()])).toEqual(['c-1', 'c-1']);
    expect(gateway.keys()).toEqual(['GET /store/carts/c-1', 'GET /store/carts/c-1']);
    expect(seen).toHaveLength(1);
    store.clear();
    expect(await store.syncToServer()).toBeNull();
  });

  it('syncFromCartData и setLocalItems — строки из ответа промокода и с оформления; cart:updated', () => {
    const store = createCheckoutStore(API_URL, keyStorage({}), document);
    const seen = updates();
    store.syncFromCartData({ discountCents: 1000, items });
    expect(store.getServerCart()).toEqual({ discountCents: 1000, items });
    store.setLocalItems('мусор');
    expect(store.getItems()).toEqual([]);
    store.syncFromCartData(null);
    expect([store.getServerCart(), seen.length]).toEqual([null, 3]);
  });

  it('часть: на витрине — window.cartStore и чтение; в превью — ничего', async () => {
    const gateway = fakeGateway();
    localStorage.setItem('merfy:cartId', 'c-1');
    gateway.answer('GET /store/carts/c-1', { status: 200, body: { cart: CART, items } });
    // Блок 10, часть 10а: вместе с корзиной часть тянет настройки формы оформления (факт 33).
    gateway.answer(`GET /public/sites/${SHOP_ID}/settings`, { status: 200, body: { settings: {} } });
    checkout.create(fakeCore('preview').core);
    expect(Reflect.get(window, 'cartStore')).toBeUndefined();
    checkout.create(fakeCore('live').core);
    await vi.waitFor(() =>
      expect(gateway.keys()).toEqual(['GET /store/carts/c-1', `GET /public/sites/${SHOP_ID}/settings`]),
    );
    expect(typeof Reflect.get(window, 'cartStore')).toBe('object');
  });
});

// Настройки формы оформления (блок 10, часть 10а, факт 33): из шлюза при открытии страницы, событие
// checkout:config-ready — всегда; гость магазина с обязательным входом — на /login. У пяти тем это скрипт страницы,
// у новой — часть checkout ядра.
describe('настройки формы оформления', () => {
  const settingsWindow = (token: string | null): { win: SettingsWindow; holder: Record<string, unknown> } => {
    const holder: Record<string, unknown> = {};
    const win: SettingsWindow = {
      self: 'top',
      top: 'top',
      localStorage: { getItem: (key: string): string | null => (key === 'merfy_customer_token' ? token : null) },
      location: { href: '' },
    };
    return { win, holder };
  };

  it('настройки из шлюза — в __MERFY_CONFIG__.checkout и событием; иное значение — дефолт', async () => {
    const gateway = fakeGateway();
    gateway.answer(`GET /public/sites/${SHOP_ID}/settings`, {
      status: 200,
      body: { settings: { contactMethod: 'email', customerNameMode: 'surname', addressRequired: false } },
    });
    const { win } = settingsWindow('t-1');
    const seen: boolean[] = [];
    document.addEventListener(CONFIG_READY_EVENT, () => seen.push(true));
    await loadCheckoutSettings(API_URL, SHOP_ID, win, document);
    expect(Reflect.get(win, '__MERFY_CONFIG__')).toEqual({
      checkout: { contactMethod: 'email', customerNameMode: 'surname', addressRequired: false, requireCustomerAuth: false },
    });
    expect(seen).toEqual([true]);
    expect(win.location.href).toBe('');
    expect(gateway.keys()).toEqual([`GET /public/sites/${SHOP_ID}/settings`]);
  });

  it('сбой сети и пустой shopId — дефолты, событие всё равно есть', async () => {
    const gateway = fakeGateway();
    gateway.answer(`GET /public/sites/${SHOP_ID}/settings`, 'network');
    const seen: boolean[] = [];
    document.addEventListener(CONFIG_READY_EVENT, () => seen.push(true));
    const offline = settingsWindow(null);
    await loadCheckoutSettings(API_URL, SHOP_ID, offline.win, document);
    const noShop = settingsWindow(null);
    await loadCheckoutSettings(API_URL, '', noShop.win, document);
    expect(Reflect.get(offline.win, '__MERFY_CONFIG__')).toEqual({
      checkout: { contactMethod: 'email-phone', customerNameMode: 'name-surname', addressRequired: true, requireCustomerAuth: false },
    });
    expect(seen).toEqual([true, true]);
    expect(gateway.keys()).toEqual([`GET /public/sites/${SHOP_ID}/settings`]);
  });

  it('гость магазина с обязательным входом — на /login, без события; конфиг уже есть — только событие', () => {
    const ready: boolean[] = [];
    document.addEventListener(CONFIG_READY_EVENT, () => ready.push(true));
    const guest = settingsWindow(null);
    publishCheckoutSettings({ requireCustomerAuth: true }, guest.win, document, guest.win);
    expect(guest.win.location.href).toBe('/login?redirect=%2Fcheckout');
    expect(ready).toEqual([]);
    publishCheckoutSettings({ requireCustomerAuth: true }, guest.win, document, guest.win);
    expect(ready).toEqual([true]);
    const readyOnce: unknown[] = [];
    document.addEventListener(CONFIG_READY_EVENT, (event) => readyOnce.push(event));
    const seeded = settingsWindow('t-1');
    Reflect.set(seeded.win, '__MERFY_CONFIG__', { shopId: SHOP_ID, checkout: { contactMethod: 'email' } });
    publishCheckoutSettings(null, seeded.win, document, seeded.win);
    expect(Reflect.get(seeded.win, '__MERFY_CONFIG__')).toEqual({
      shopId: SHOP_ID,
      checkout: { contactMethod: 'email' },
    });
    expect(readyOnce).toHaveLength(1);
  });
});

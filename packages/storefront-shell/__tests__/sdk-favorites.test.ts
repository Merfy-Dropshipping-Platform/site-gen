import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CUSTOMER_TOKEN_KEY } from '../src/core/customer-token';
import { NOTICE_TEXT } from '../src/core/failures';
import {
  FAVORITES_KEY,
  FAVORITES_LIMIT,
  FAVORITES_LIMIT_TEXT,
  MERGED_TEXT,
  clearFavorites,
  favorites,
  mergeFavorites,
} from '../src/core/parts/favorites';
import { watchSource } from '../src/core/stores';
import type { ReadableStore } from '../src/core/types';
import { SHOP_ID, fakeCore, fakeGateway, field } from './sdk-support';

// Избранное (блок 10 «Секций и SDK», 10.6, «Решил сам» пп. 12, 13, 15; часть 10б, Р10б-4…Р10б-9): гостья — браузер,
// вошедшая — storefront/wishlist шлюза с токеном; слияние при входе; карточки — /store/products?ids по 100.
const STORE_UNMOUNT_DELAY = 1000;
const NOW = 1_800_000_000_000;
const TOKEN = 't-customer-1';
const stops: Array<() => void> = [];

const settle = async (): Promise<void> => {
  for (let i = 0; i < 6; i += 1) await vi.advanceTimersByTimeAsync(0);
};
const watch = <T>(store: ReadableStore<T>): void => {
  stops.push(watchSource(store)?.listen(() => undefined) ?? (() => undefined));
};
const guestList = (...items: Array<[string, number]>): void =>
  localStorage.setItem(FAVORITES_KEY, JSON.stringify({ ids: items.map(([productId, addedAt]) => ({ productId, addedAt })) }));
const stored = (): unknown => JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? 'null');
const serverList = (...items: Array<[string, number]>) => ({
  status: 200,
  body: { success: true, data: items.map(([productId, addedAt]) => ({ productId, addedAt })) },
});
// Адрес запроса без String(Request): '[object Object]' (правило линтера no-base-to-string).
const urlOf = (input: string | URL | Request): string => {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
};
const fetchCalls = () =>
  vi.mocked(fetch).mock.calls.map(([input, init]) => ({ url: new URL(urlOf(input)), headers: init?.headers }));
const raw = (id: string) => ({
  id,
  title: `Шарф ${id}`,
  handle: `scarf-${id}`,
  basePrice: 2490,
  compareAtPrice: null,
  images: [],
  quantity: 1,
  hasVariants: false,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  localStorage.clear();
});

afterEach(async () => {
  stops.splice(0).forEach((stop) => stop());
  await vi.advanceTimersByTimeAsync(STORE_UNMOUNT_DELAY * 2);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Вошедшая: токен и список сервера, прочитанный по подписке на $favorites.
async function signedIn(...items: Array<[string, number]>) {
  localStorage.setItem(CUSTOMER_TOKEN_KEY, TOKEN);
  const gateway = fakeGateway();
  gateway.answer('GET /storefront/wishlist', serverList(...items));
  const handle = fakeCore();
  const module = favorites.create(handle.core);
  watch(module.$favorites);
  await settle();
  return { gateway, module, ...handle };
}

describe('избранное гостьи', () => {
  it('отметка — сразу, сверху списка, в браузере с addedAt; событие сразу; повтор — снять; запросов нет', async () => {
    const gateway = fakeGateway();
    const { core, named } = fakeCore();
    const module = favorites.create(core);
    expect(module.$favorites.get()).toEqual({ ready: true, ids: [] });
    await module.toggle({ productId: 'p1' });
    vi.setSystemTime(NOW + 1000);
    expect(await module.toggle({ productId: 'p2' })).toEqual({ ok: true, data: { added: true } });
    expect(module.$favorites.get()).toEqual({ ready: true, ids: ['p2', 'p1'] });
    expect(module.$count.get()).toBe(2);
    expect(stored()).toEqual({ ids: [{ productId: 'p2', addedAt: NOW + 1000 }, { productId: 'p1', addedAt: NOW }] });
    expect(await module.toggle({ productId: 'p1' })).toEqual({ ok: true, data: { added: false } });
    expect(named('merfy:favorites:add')).toEqual([{ productId: 'p1' }, { productId: 'p2' }]);
    expect(named('merfy:favorites:remove')).toEqual([{ productId: 'p1' }]);
    expect(gateway.calls).toEqual([]);
  });

  it('список браузера при открытии — новые сверху; значение не по форме — пустой список', () => {
    guestList(['p1', NOW - 10], ['p2', NOW]);
    expect(favorites.create(fakeCore().core).$favorites.get()).toEqual({ ready: true, ids: ['p2', 'p1'] });
    localStorage.setItem(FAVORITES_KEY, '{"ids":"p1"}');
    expect(favorites.create(fakeCore().core).$favorites.get()).toEqual({ ready: true, ids: [] });
  });

  it(`${FAVORITES_LIMIT + 1}-й товар — limit с текстом, список прежний`, async () => {
    guestList(...Array.from({ length: FAVORITES_LIMIT }, (_, i): [string, number] => [`p${i}`, NOW - i]));
    const { core, named } = fakeCore();
    const module = favorites.create(core);
    expect(await module.toggle({ productId: 'p-new' })).toEqual({
      ok: false,
      error: { code: 'limit', message: FAVORITES_LIMIT_TEXT },
    });
    expect(module.$count.get()).toBe(FAVORITES_LIMIT);
    expect(named('merfy:notice:show')).toEqual([{ level: 'error', message: FAVORITES_LIMIT_TEXT, code: 'limit' }]);
  });

  it('другая вкладка поменяла список — стор перечитан, пока на него подписаны', () => {
    const module = favorites.create(fakeCore().core);
    watch(module.$favorites);
    guestList(['p9', NOW]);
    window.dispatchEvent(new StorageEvent('storage', { key: FAVORITES_KEY }));
    expect(module.$favorites.get()).toEqual({ ready: true, ids: ['p9'] });
  });

  it('превью — память страницы: в localStorage ничего', async () => {
    const module = favorites.create(fakeCore('preview').core);
    await module.toggle({ productId: 'p1' });
    expect(module.$favorites.get().ids).toEqual(['p1']);
    expect(localStorage.getItem(FAVORITES_KEY)).toBeNull();
  });
});

describe('избранное вошедшей', () => {
  it('список — с сервера при первой подписке, с токеном; до ответа ready: false; список браузера не читается', async () => {
    localStorage.setItem(CUSTOMER_TOKEN_KEY, TOKEN);
    guestList(['p-guest', NOW]);
    const gateway = fakeGateway();
    gateway.answer('GET /storefront/wishlist', serverList(['p1', NOW - 5], ['p2', NOW]));
    const module = favorites.create(fakeCore().core);
    expect(module.$favorites.get()).toEqual({ ready: false, ids: [] });
    watch(module.$favorites);
    await settle();
    expect(module.$favorites.get()).toEqual({ ready: true, ids: ['p2', 'p1'] });
    expect(gateway.keys()).toEqual(['GET /storefront/wishlist']);
    expect(fetchCalls()[0]?.headers).toEqual({ authorization: `Bearer ${TOKEN}` });
  });

  it('отметка — стор сразу, POST items, событие после ответа; ошибка — откат и уведомление; браузер не трогается', async () => {
    const { gateway, module, named } = await signedIn();
    gateway.answer(
      'POST /storefront/wishlist/items',
      { status: 201, body: { success: true, data: { productId: 'p1', addedAt: NOW } } },
      { status: 500, body: { success: false } },
    );
    const pending = module.toggle({ productId: 'p1' });
    expect(module.$favorites.get().ids).toEqual(['p1']);
    expect(named('merfy:favorites:add')).toEqual([]);
    expect(await pending).toEqual({ ok: true, data: { added: true } });
    expect(named('merfy:favorites:add')).toEqual([{ productId: 'p1' }]);
    expect(gateway.calls.at(-1)).toEqual({ key: 'POST /storefront/wishlist/items', body: { productId: 'p1' } });
    expect(await module.toggle({ productId: 'p2' })).toEqual({
      ok: false,
      error: { code: 'server', message: NOTICE_TEXT.server },
    });
    expect(module.$favorites.get().ids).toEqual(['p1']);
    expect(named('merfy:notice:show')).toEqual([{ level: 'error', message: NOTICE_TEXT.server, code: 'server' }]);
    expect(localStorage.getItem(FAVORITES_KEY)).toBeNull();
  });

  it('снять — DELETE items; 409 при отметке — limit с текстом', async () => {
    const { gateway, module } = await signedIn(['p1', NOW]);
    gateway.answer('DELETE /storefront/wishlist/items', { status: 200, body: { success: true } });
    expect(await module.toggle({ productId: 'p1' })).toEqual({ ok: true, data: { added: false } });
    expect(gateway.calls.at(-1)).toEqual({ key: 'DELETE /storefront/wishlist/items', body: { productId: 'p1' } });
    gateway.answer('POST /storefront/wishlist/items', { status: 409, body: { success: false, error: 'LIMIT_EXCEEDED' } });
    expect(await module.toggle({ productId: 'p3' })).toEqual({
      ok: false,
      error: { code: 'limit', message: FAVORITES_LIMIT_TEXT },
    });
    expect(module.$favorites.get().ids).toEqual([]);
  });

  it('401 при чтении — токен удалён, merfy:auth:signout, избранное гостьи; уведомления нет', async () => {
    localStorage.setItem(CUSTOMER_TOKEN_KEY, TOKEN);
    const gateway = fakeGateway();
    gateway.answer('GET /storefront/wishlist', { status: 401, body: { message: 'Invalid or expired session' } });
    const { core, named } = fakeCore();
    const module = favorites.create(core);
    watch(module.$favorites);
    await settle();
    expect(localStorage.getItem(CUSTOMER_TOKEN_KEY)).toBeNull();
    expect(named('merfy:auth:signout')).toEqual([{}]);
    expect(module.$favorites.get()).toEqual({ ready: true, ids: [] });
    expect(named('merfy:notice:show')).toEqual([]);
  });
});

describe('вход и выход', () => {
  it('mergeFavorites: сервер и браузер без повторов, новые сверху, PUT, браузер стёрт', async () => {
    guestList(['p2', NOW], ['p1', NOW - 100]);
    const gateway = fakeGateway();
    const module = favorites.create(fakeCore().core);
    localStorage.setItem(CUSTOMER_TOKEN_KEY, TOKEN);
    gateway.answer('GET /storefront/wishlist', serverList(['p1', NOW - 50], ['p3', NOW - 200]));
    gateway.answer('PUT /storefront/wishlist', { status: 200, body: { success: true, data: [] } });
    expect(await mergeFavorites(module)).toEqual({ ok: true, data: null });
    expect(gateway.calls.at(-1)).toEqual({
      key: 'PUT /storefront/wishlist',
      body: {
        items: [
          { productId: 'p2', addedAt: NOW },
          { productId: 'p1', addedAt: NOW - 50 },
          { productId: 'p3', addedAt: NOW - 200 },
        ],
      },
    });
    expect(localStorage.getItem(FAVORITES_KEY)).toBeNull();
    expect(module.$favorites.get()).toEqual({ ready: true, ids: ['p2', 'p1', 'p3'] });
  });

  it(`вместе больше ${FAVORITES_LIMIT} — последние ${FAVORITES_LIMIT} и предупреждение`, async () => {
    guestList(...Array.from({ length: 150 }, (_, i): [string, number] => [`b${i}`, NOW - i]));
    const gateway = fakeGateway();
    const { core, named } = fakeCore();
    const module = favorites.create(core);
    localStorage.setItem(CUSTOMER_TOKEN_KEY, TOKEN);
    gateway.answer('GET /storefront/wishlist', serverList(...Array.from({ length: 100 }, (_, i): [string, number] => [`s${i}`, NOW - 1000 - i])));
    gateway.answer('PUT /storefront/wishlist', { status: 200, body: { success: true, data: [] } });
    await mergeFavorites(module);
    expect(field(gateway.calls.at(-1)?.body, 'items')).toHaveLength(FAVORITES_LIMIT);
    expect(module.$count.get()).toBe(FAVORITES_LIMIT);
    expect(named('merfy:notice:show')).toEqual([{ level: 'warning', message: MERGED_TEXT }]);
  });

  it('ошибка слияния — список браузера остаётся, уведомление по коду', async () => {
    guestList(['p1', NOW]);
    const gateway = fakeGateway();
    const { core, named } = fakeCore();
    const module = favorites.create(core);
    localStorage.setItem(CUSTOMER_TOKEN_KEY, TOKEN);
    gateway.answer('GET /storefront/wishlist', serverList());
    gateway.answer('PUT /storefront/wishlist', 'network');
    expect(await mergeFavorites(module)).toEqual({ ok: false, error: { code: 'network', message: NOTICE_TEXT.network } });
    expect(stored()).toEqual({ ids: [{ productId: 'p1', addedAt: NOW }] });
    expect(named('merfy:notice:show')).toEqual([{ level: 'error', message: NOTICE_TEXT.network, code: 'network' }]);
  });

  it('clearFavorites — стор пустой, список браузера стёрт', () => {
    guestList(['p1', NOW]);
    const module = favorites.create(fakeCore().core);
    clearFavorites(module);
    expect(module.$favorites.get()).toEqual({ ready: true, ids: [] });
    expect(localStorage.getItem(FAVORITES_KEY)).toBeNull();
  });
});

describe('карточки отмеченных', () => {
  it('по 100 id в запросе, магазин страницы; карточки в порядке списка; нет в ответе — нет карточки', async () => {
    guestList(...Array.from({ length: 150 }, (_, i): [string, number] => [`p${i}`, NOW - i]));
    const gateway = fakeGateway();
    gateway.answer(
      'GET /store/products',
      { status: 200, body: { products: [raw('p1'), raw('p0')] } },
      { status: 200, body: { products: [raw('p149')] } },
    );
    const module = favorites.create(fakeCore().core);
    expect(module.$products.get()).toEqual({ ready: false, products: [] });
    watch(module.$products);
    await settle();
    const urls = fetchCalls().map(({ url }) => url);
    expect(urls.map((url) => url.searchParams.get('store_id'))).toEqual([SHOP_ID, SHOP_ID]);
    expect(urls.map((url) => url.searchParams.get('ids')?.split(',').length)).toEqual([100, 50]);
    expect(urls[0]?.searchParams.get('ids')?.split(',')[0]).toBe('p0');
    expect(module.$products.get().ready).toBe(true);
    expect(module.$products.get().products.map((item) => [item.id, item.url, item.price.amount])).toEqual([
      ['p0', '/product/scarf-p0', 249000],
      ['p1', '/product/scarf-p1', 249000],
      ['p149', '/product/scarf-p149', 249000],
    ]);
  });

  it('снятая отметка — карточка уходит без запроса; новая — запрос только её', async () => {
    guestList(['p1', NOW]);
    const gateway = fakeGateway();
    gateway.answer('GET /store/products', { status: 200, body: { products: [raw('p1')] } }, { status: 200, body: { products: [raw('p2')] } });
    const module = favorites.create(fakeCore().core);
    watch(module.$products);
    await settle();
    await module.toggle({ productId: 'p1' });
    await settle();
    expect(module.$products.get().products).toEqual([]);
    expect(gateway.calls).toHaveLength(1);
    await module.toggle({ productId: 'p2' });
    await settle();
    expect(fetchCalls().at(-1)?.url.searchParams.get('ids')).toBe('p2');
    expect(module.$products.get().products.map((item) => item.id)).toEqual(['p2']);
  });
});

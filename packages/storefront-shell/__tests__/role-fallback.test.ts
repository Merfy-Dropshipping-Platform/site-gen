import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { navigation } from '../src/core/navigation';
import { CART_ID_KEY, cart } from '../src/core/parts/cart';
import { search, searchNavigation } from '../src/core/parts/search';
import { roleSection } from '../src/core/roles';
import { watchSource } from '../src/core/stores';
import type { ReadableStore, SectionEvent } from '../src/core/types';
import { fakeCore, fakeGateway, serverItem } from './sdk-support';

// Запасной путь ядра для секций с ролью (блок 12 «Секций и SDK», 12.1, 12.4, «Решил сам» пп. 6, 15, 16; часть 12а):
// секция — по data-role; её нет или её скрипт упал — cart.open ведёт на /cart, search.open — на /catalog; номер корзины
// — в merfy:cartId при каждом получении.
const CART = { id: 'c-1', subtotalCents: 0, discountCents: 0, totalCents: 0, promoCode: null };
const STORE_UNMOUNT_DELAY = 1000;
const CHECKOUT_KEY = 'merfy:cartId';
const stops: Array<() => void> = [];

const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i += 1) await vi.advanceTimersByTimeAsync(0);
};
const watch = <T>(store: ReadableStore<T>): void => {
  stops.push(watchSource(store)?.listen(() => undefined) ?? (() => undefined));
};
// Экземпляр секции с ролью; имя — не «наше»: ядро ищет по роли.
const place = (role: string, failed = false): void => {
  const state = failed ? ' data-merfy-state="failed"' : '';
  document.body.insertAdjacentHTML(
    'beforeend',
    `<merfy-section data-section="shop:my-${role}" data-section-id="${role}-1" data-role="${role}"${state}><div data-behavior="dialog"></div></merfy-section>`,
  );
};
const clickEvent = () => {
  const preventDefault = vi.fn();
  const event: SectionEvent = { type: 'click', key: null, inside: () => false, preventDefault };
  return { event, preventDefault };
};

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});

afterEach(async () => {
  stops.splice(0).forEach((stop) => stop());
  await vi.advanceTimersByTimeAsync(STORE_UNMOUNT_DELAY * 2);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('cart.open по роли cart-drawer', () => {
  it('секция работает — merfy:cart:open; сбой — переход на /cart; окно «Товар добавлен» — не выезжающая корзина', async () => {
    const go = vi.spyOn(navigation, 'go').mockImplementation(() => undefined);
    place('cart-drawer');
    const handle = fakeCore();
    const module = cart.create(handle.core);
    expect(await module.open()).toEqual({ ok: true, data: { drawer: true } });
    roleSection(document, 'cart-drawer')?.setAttribute('data-merfy-state', 'failed');
    expect(await module.open()).toEqual({ ok: true, data: { drawer: false } });
    document.body.replaceChildren();
    place('cart-added');
    expect(await module.open()).toEqual({ ok: true, data: { drawer: false } });
    expect([handle.named('merfy:cart:open'), go.mock.calls]).toEqual([[{}], [['/cart'], ['/cart']]]);
  });

  it('из разметки при сбое — переход не отменён: ссылка /cart ведёт сама', async () => {
    const go = vi.spyOn(navigation, 'go').mockImplementation(() => undefined);
    place('cart-drawer', true);
    const module = cart.create(fakeCore().core);
    const { event, preventDefault } = clickEvent();
    expect(await cart.markup?.open?.call(module, {}, event)).toEqual({ ok: true, data: { drawer: false } });
    expect([preventDefault.mock.calls.length, go.mock.calls.length]).toEqual([0, 0]);
  });
});

describe('search.open по роли search', () => {
  it('«Поиск» со сбоем — переход на /catalog; работает — merfy:search:open', async () => {
    const go = vi.spyOn(searchNavigation, 'go').mockImplementation(() => undefined);
    const fake = fakeCore();
    const api = search.create(fake.core);
    place('search', true);
    expect(await api.open()).toEqual({ ok: true, data: { panel: false } });
    document.body.replaceChildren();
    place('search');
    expect(await api.open()).toEqual({ ok: true, data: { panel: true } });
    expect([fake.named('merfy:search:open'), go.mock.calls]).toEqual([[{}], [['/catalog']]]);
  });
});

describe('номер корзины для оформления (п. 16)', () => {
  it('новая корзина при «В корзину» — номер сразу и в merfy:cartId', async () => {
    const gateway = fakeGateway();
    gateway.answer('POST /store/carts', { status: 201, body: { cart: { id: 'c-1', status: 'cart' } } });
    gateway.answer('POST /store/carts/c-1/items', { status: 201, body: { item: serverItem('l-1', 'p12', 1) } });
    const module = cart.create(fakeCore().core);
    expect((await module.add({ productId: 'p12' })).ok).toBe(true);
    expect([localStorage.getItem(CART_ID_KEY), localStorage.getItem(CHECKOUT_KEY)]).toEqual(['c-1', 'c-1']);
  });

  it('корзина прошлого визита прочитана — её номер в merfy:cartId', async () => {
    const gateway = fakeGateway();
    localStorage.setItem(CART_ID_KEY, 'c-1');
    gateway.answer('GET /store/carts/c-1', { status: 200, body: { cart: CART, items: [serverItem('l-1', 'p12', 2)] } });
    watch(cart.create(fakeCore().core).$cart);
    await settle();
    expect(localStorage.getItem(CHECKOUT_KEY)).toBe('c-1');
  });

  it('корзины больше нет — оба номера стёрты; номер другой корзины в merfy:cartId остаётся', async () => {
    const gateway = fakeGateway();
    localStorage.setItem(CART_ID_KEY, 'c-gone');
    localStorage.setItem(CHECKOUT_KEY, 'c-gone');
    gateway.answer('GET /store/carts/c-gone', { status: 404, body: { message: 'Cart not found' } });
    watch(cart.create(fakeCore().core).$cart);
    await settle();
    expect([localStorage.getItem(CART_ID_KEY), localStorage.getItem(CHECKOUT_KEY)]).toEqual([null, null]);
    localStorage.setItem(CART_ID_KEY, 'c-gone');
    localStorage.setItem(CHECKOUT_KEY, 'c-other');
    gateway.answer('GET /store/carts/c-gone', { status: 404, body: { message: 'Cart not found' } });
    watch(cart.create(fakeCore().core).$cart);
    await settle();
    expect([localStorage.getItem(CART_ID_KEY), localStorage.getItem(CHECKOUT_KEY)]).toEqual([null, 'c-other']);
  });
});

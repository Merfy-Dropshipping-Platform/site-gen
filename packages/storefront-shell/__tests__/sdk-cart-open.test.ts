import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HANDOFF_KEY, PAYMENT_VERDICT, PENDING_ORDER_KEY, readHandoff } from '../src/core/cart-checkout';
import { previewCartStorage } from '../src/core/cart-preview';
import { navigation } from '../src/core/navigation';
import { CART_ID_KEY, cart } from '../src/core/parts/cart';
import { pageStorage } from '../src/core/storage';
import { watchSource } from '../src/core/stores';
import type { CartModule, Mode, ReadableStore, SectionEvent } from '../src/core/types';
import { fakeCore, fakeGateway, serverItem, storefrontConfig } from './sdk-support';

// cart.open, cart.checkout, заказ после оплаты и номер корзины в превью (блок 10 «Секций и SDK», 10.2, 10.5; «Решил
// сам» пп. 4, 5, 9, 11, 24; часть 10а, Р10а-4…Р10а-9).
const CART = { id: 'c-1', subtotalCents: 0, discountCents: 0, totalCents: 0, promoCode: null };
const UUID = '0b6f3a1e-5c2d-4e8f-9a7b-1c2d3e4f5a6b';
const STORE_UNMOUNT_DELAY = 1000;
const stops: Array<() => void> = [];
let go: ReturnType<typeof vi.spyOn>;

const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i += 1) await vi.advanceTimersByTimeAsync(0);
};
const watch = <T>(store: ReadableStore<T>): void => {
  stops.push(watchSource(store)?.listen(() => undefined) ?? (() => undefined));
};
const clickEvent = () => {
  const preventDefault = vi.fn();
  const event: SectionEvent = { type: 'click', key: null, inside: () => false, preventDefault };
  return { event, preventDefault };
};

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  go = vi.spyOn(navigation, 'go').mockImplementation(() => undefined);
});

afterEach(async () => {
  stops.splice(0).forEach((stop) => stop());
  await vi.advanceTimersByTimeAsync(STORE_UNMOUNT_DELAY * 2);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function moduleWith(cartType: Record<string, string> | null = null, mode: Mode = 'live') {
  const base = storefrontConfig(mode);
  const theme = cartType === null ? base.theme : { ...base.theme, settings: cartType };
  const handle = fakeCore(mode, { ...base, theme });
  const module: CartModule = cart.create(handle.core);
  return { module, ...handle };
}
const placeDrawer = (): void => {
  document.body.innerHTML = '<div data-behavior="dialog" data-open-on="cart-open"><dialog data-part="content"></dialog></div>';
};

describe('cart.open', () => {
  it('«Сайдбар» по умолчанию и окно на странице: из разметки — переход отменён сразу, merfy:cart:open', async () => {
    placeDrawer();
    const { module, named } = moduleWith();
    const { event, preventDefault } = clickEvent();
    const pending = cart.markup?.open?.call(module, {}, event);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(await pending).toEqual({ ok: true, data: { drawer: true } });
    expect(named('merfy:cart:open')).toEqual([{}]);
  });

  it('из скрипта при «Сайдбар» — событие, без перехода', async () => {
    placeDrawer();
    const { module, named } = moduleWith({ 'cart-type': 'drawer' });
    expect(await module.open()).toEqual({ ok: true, data: { drawer: true } });
    expect(named('merfy:cart:open')).toEqual([{}]);
    expect(go).not.toHaveBeenCalled();
  });

  it('«Страница» или окна нет: из разметки — ссылка ведёт сама; из скрипта — переход на /cart', async () => {
    placeDrawer();
    const { module, named } = moduleWith({ 'cart-type': 'page' });
    const { event, preventDefault } = clickEvent();
    expect(await cart.markup?.open?.call(module, {}, event)).toEqual({ ok: true, data: { drawer: false } });
    expect([preventDefault.mock.calls.length, go.mock.calls.length]).toEqual([0, 0]);
    document.body.replaceChildren();
    const other = moduleWith();
    expect(await other.module.open()).toEqual({ ok: true, data: { drawer: false } });
    expect(go.mock.calls).toEqual([['/cart']]);
    expect([named('merfy:cart:open'), other.named('merfy:cart:open')]).toEqual([[], []]);
  });

  it('в превью без окна — без перехода', async () => {
    const { module } = moduleWith({}, 'preview');
    expect(await module.open()).toEqual({ ok: true, data: { drawer: false } });
    expect(go).not.toHaveBeenCalled();
  });
});

describe('cart.checkout', () => {
  it('ждёт очередь, пишет merfy:cartId и копию строк без подарка, переходит на /checkout', async () => {
    const gateway = fakeGateway();
    localStorage.setItem(CART_ID_KEY, 'c-1');
    const gift = { ...serverItem('l-3', 'p12', 1), unitPriceCents: 0, totalCents: 0, isBonus: true };
    gateway.answer('GET /store/carts/c-1', {
      status: 200,
      body: { cart: CART, items: [serverItem('l-1', 'p12', 2), serverItem('l-2', 'p7', 1, 'v-red'), gift] },
    });
    const { module } = moduleWith();
    const { event, preventDefault } = clickEvent();
    const pending = cart.markup?.checkout?.call(module, {}, event);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(await pending).toEqual({ ok: true, data: null });
    expect(localStorage.getItem('merfy:cartId')).toBe('c-1');
    expect(readHandoff(localStorage.getItem(HANDOFF_KEY))).toEqual({
      cartId: 'c-1',
      lines: [
        { productId: 'p12', variantId: null, quantity: 2 },
        { productId: 'p7', variantId: 'v-red', quantity: 1 },
      ],
    });
    expect(go.mock.calls).toEqual([['/checkout']]);
  });

  it('пустая корзина — invalid, перехода нет; в превью — ничего, переход не отменён', async () => {
    fakeGateway();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { module } = moduleWith();
    const result = await module.checkout();
    expect(result.ok ? null : result.error).toEqual({ code: 'invalid', message: 'cart.checkout: корзина пуста' });
    expect([go.mock.calls.length, localStorage.getItem('merfy:cartId')]).toEqual([0, null]);
    const preview = moduleWith({}, 'preview');
    const { event, preventDefault } = clickEvent();
    expect(await cart.markup?.checkout?.call(preview.module, {}, event)).toEqual({ ok: true, data: null });
    expect([preventDefault.mock.calls.length, go.mock.calls.length]).toEqual([0, 0]);
  });

  it('копия строк: мусор и строки не по форме — null', () => {
    expect([readHandoff(null), readHandoff('{'), readHandoff('{"cartId":"","lines":[]}')]).toEqual([null, null, null]);
    expect(readHandoff('{"cartId":"c-1","lines":[{"productId":"p12","quantity":0}]}')).toBeNull();
  });
});

describe('заказ после оплаты', () => {
  const pending = (orderId: string) =>
    localStorage.setItem(PENDING_ORDER_KEY, JSON.stringify({ orderId, apiBase: 'https://evil.example', items: [] }));
  const handoff = (cartId: string) =>
    localStorage.setItem(HANDOFF_KEY, JSON.stringify({ cartId, lines: [{ productId: 'p12', variantId: null, quantity: 2 }] }));
  const status = (value: string) => ({ status: 200, body: { success: true, data: { status: value } } });

  it('таблица исходов — как у пяти тем', () => {
    expect(PAYMENT_VERDICT).toEqual({
      succeeded: 'paid',
      refunded: 'paid',
      failed: 'abandoned',
      cancelled: 'abandoned',
      not_found: 'abandoned',
      pending: 'wait',
      processing: 'wait',
    });
  });

  it('оплачено — запись, копия и номер этого заказа стёрты; адрес — из конфига, не из записи', async () => {
    const gateway = fakeGateway();
    pending('c-1');
    handoff('c-1');
    localStorage.setItem(CART_ID_KEY, 'c-1');
    gateway.answer('GET /orders/c-1/payment-status', status('succeeded'));
    const { module } = moduleWith();
    watch(module.$count);
    await settle();
    expect(gateway.keys()).toEqual(['GET /orders/c-1/payment-status']);
    expect([PENDING_ORDER_KEY, HANDOFF_KEY, CART_ID_KEY].map((key) => localStorage.getItem(key))).toEqual([null, null, null]);
    expect(module.$cart.get()).toEqual({ ready: true, lines: [] });
  });

  it('не оплачено — новая корзина из копии того же заказа', async () => {
    const gateway = fakeGateway();
    pending('c-1');
    handoff('c-1');
    gateway.answer('GET /orders/c-1/payment-status', status('cancelled'));
    gateway.answer('POST /store/carts', { status: 201, body: { cart: { id: 'c-2' } } });
    gateway.answer('POST /store/carts/c-2/items', { status: 201, body: { item: serverItem('l-9', 'p12', 2) } });
    gateway.answer('GET /store/carts/c-2', { status: 200, body: { cart: CART, items: [serverItem('l-9', 'p12', 2)] } });
    const { module } = moduleWith();
    await settle();
    expect(gateway.keys()).toEqual([
      'GET /orders/c-1/payment-status',
      'POST /store/carts',
      'POST /store/carts/c-2/items',
      'GET /store/carts/c-2',
    ]);
    expect(gateway.calls[2]?.body).toEqual({ product_id: 'p12', quantity: 2 });
    expect([localStorage.getItem(CART_ID_KEY), localStorage.getItem(PENDING_ORDER_KEY)]).toEqual(['c-2', null]);
    expect(module.$count.get()).toBe(2);
  });

  it('копия от другого заказа не используется; ждёт — повтор по merfy:page:visible, не раньше', async () => {
    const gateway = fakeGateway();
    pending('c-1');
    handoff('c-0');
    gateway.answer('GET /orders/c-1/payment-status', status('pending'), status('failed'));
    moduleWith();
    await settle();
    expect(localStorage.getItem(PENDING_ORDER_KEY)).not.toBeNull();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(gateway.keys()).toHaveLength(1);
    document.dispatchEvent(new CustomEvent('merfy:page:visible'));
    await settle();
    expect(gateway.keys()).toEqual(['GET /orders/c-1/payment-status', 'GET /orders/c-1/payment-status']);
    expect([localStorage.getItem(PENDING_ORDER_KEY), localStorage.getItem(HANDOFF_KEY) !== null]).toEqual([null, true]);
  });

  it('записи нет или превью — запросов нет', async () => {
    const gateway = fakeGateway();
    moduleWith();
    pending('c-1');
    moduleWith({}, 'preview');
    await settle();
    expect(gateway.calls).toEqual([]);
  });
});

describe('номер корзины в превью', () => {
  it('номер из адреса рамки — в память; новый номер — сообщение родителю; не uuid — пропуск', () => {
    const postMessage = vi.fn();
    const win = { location: { search: `?merfy-cart=${UUID}` }, parent: { postMessage } };
    const storage = previewCartStorage(pageStorage(window, 'preview'), win, CART_ID_KEY);
    expect(storage.getItem(CART_ID_KEY)).toBe(UUID);
    expect(postMessage).not.toHaveBeenCalled();
    storage.setItem(CART_ID_KEY, 'c-2');
    storage.setItem('merfy:other', 'x');
    expect(postMessage.mock.calls).toEqual([[{ type: 'cart-id', id: 'c-2' }, '*']]);
    const odd = previewCartStorage(pageStorage(window, 'preview'), { location: { search: '?merfy-cart=../x' }, parent: { postMessage } }, CART_ID_KEY);
    expect(odd.getItem(CART_ID_KEY)).toBeNull();
  });
});

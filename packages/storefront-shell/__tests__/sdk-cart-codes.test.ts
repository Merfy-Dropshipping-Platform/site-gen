import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTICE_TEXT } from '../src/core/failures';
import { CART_ID_KEY, cart } from '../src/core/parts/cart';
import { watchSource } from '../src/core/stores';
import type { CoreHandle } from '../src/core/types';
import { SHOP_ID, fakeCore, fakeGateway, serverItem } from './sdk-support';

// Договор кодов корзины (блок 9 «Секций и SDK», 9.6; часть 9б) — сторона SDK. Тела ответов — ровно те, что отдаёт шлюз
// на POST /store/carts и POST /store/carts/:id/items (api-gateway, src/store/__tests__/store.cart-codes.spec.ts;
// коды — orders, src/cart/cart-errors.ts): 400 и { success: false, code, message }. Поменял тело здесь — поменяй и там.
const BODY = {
  outOfStock: { success: false, code: 'out_of_stock', message: 'Товара нет в наличии' },
  productNotFound: { success: false, code: 'product_not_found', message: 'Product not found' },
  cartNotFound: { success: false, code: 'cart_not_found', message: 'Cart not found' },
  addFailed: { success: false, code: 'cart_add_failed', message: 'Failed to add item' },
  createFailed: { success: false, code: 'cart_create_failed', message: 'Shop not found' },
} as const;
const CART = { id: 'c-1', shopId: SHOP_ID, status: 'cart' };
const created = { status: 201, body: { cart: CART } };
const added = { status: 201, body: { item: serverItem('l-1', 'p12', 1) } };
const STORE_UNMOUNT_DELAY = 1000;
const stops: Array<() => void> = [];

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
});

// Модуль корзины и подписка на $count, как у «Значка корзины».
function openCart(handle: CoreHandle) {
  const module = cart.create(handle);
  const stop = watchSource(module.$count)?.listen(() => undefined);
  stops.push(() => stop?.());
  return module;
}

describe('коды шлюза → ответ cart.add', () => {
  it.each([
    [BODY.outOfStock, 'out-of-stock', NOTICE_TEXT['out-of-stock']],
    [BODY.addFailed, 'server', NOTICE_TEXT.server],
  ])('400 %j — код %s и уведомление «%s»', async (body, code, text) => {
    const gateway = fakeGateway();
    gateway.answer('POST /store/carts', created);
    gateway.answer('POST /store/carts/c-1/items', { status: 400, body });
    const fake = fakeCore();
    const module = openCart(fake.core);
    expect(await module.add({ productId: 'p12' })).toEqual({ ok: false, error: { code, message: text } });
    expect(fake.named('merfy:notice:show')).toEqual([{ level: 'error', message: text, code }]);
    expect(module.$count.get()).toBe(0);
  });

  it('product_not_found — invalid: покупателю ничего, автору — строка в консоли', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const gateway = fakeGateway();
    gateway.answer('POST /store/carts', created);
    gateway.answer('POST /store/carts/c-1/items', { status: 400, body: BODY.productNotFound });
    const fake = fakeCore();
    const module = openCart(fake.core);
    const result = await module.add({ productId: 'p404' });
    expect(result).toEqual({
      ok: false,
      error: { code: 'invalid', message: 'cart.add: товара p404 нет — проверьте productId' },
    });
    expect(fake.events).toEqual([]);
    expect(consoleError).toHaveBeenCalledWith('cart.add: товара p404 нет — проверьте productId');
  });

  it('cart_not_found — номер стёрт, новая корзина, одна попытка, ok', async () => {
    const gateway = fakeGateway();
    localStorage.setItem(CART_ID_KEY, 'c-old');
    gateway.answer('GET /store/carts/c-old', { status: 200, body: { cart: { ...CART, id: 'c-old' }, items: [] } });
    gateway.answer('POST /store/carts/c-old/items', { status: 400, body: BODY.cartNotFound });
    gateway.answer('POST /store/carts', created);
    gateway.answer('POST /store/carts/c-1/items', added);
    const fake = fakeCore();
    const module = openCart(fake.core);
    const result = await module.add({ productId: 'p12' });
    expect(gateway.keys()).toEqual([
      'GET /store/carts/c-old',
      'POST /store/carts/c-old/items',
      'POST /store/carts',
      'POST /store/carts/c-1/items',
    ]);
    expect(result.ok).toBe(true);
    expect(localStorage.getItem(CART_ID_KEY)).toBe('c-1');
    expect(fake.named('merfy:notice:show')).toEqual([]);
  });

  it('создание корзины 400 cart_create_failed — server, добавления нет', async () => {
    const gateway = fakeGateway();
    gateway.answer('POST /store/carts', { status: 400, body: BODY.createFailed });
    const fake = fakeCore();
    const module = openCart(fake.core);
    const result = await module.add({ productId: 'p12' });
    expect(result).toEqual({ ok: false, error: { code: 'server', message: NOTICE_TEXT.server } });
    expect(gateway.keys()).toEqual(['POST /store/carts']);
    expect(fake.named('merfy:notice:show')).toEqual([{ level: 'error', message: NOTICE_TEXT.server, code: 'server' }]);
  });
});

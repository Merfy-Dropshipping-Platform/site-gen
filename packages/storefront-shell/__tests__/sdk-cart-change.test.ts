import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { remainText } from '../src/core/cart-change';
import { NOTICE_TEXT } from '../src/core/failures';
import { CART_ID_KEY, cart } from '../src/core/parts/cart';
import { watchSource } from '../src/core/stores';
import type { ReadableStore } from '../src/core/types';
import { cartLine, fakeCore, fakeGateway, gate, serverItem } from './sdk-support';

// cart.change, cart.remove, $totals и $total (блок 10 «Секций и SDK», 10.1, «Решил сам» пп. 2, 3; часть 10а,
// Р10а-2, Р10а-3): PATCH или DELETE, потом GET; счётчик — сразу, строка и итоги — после ответа.
const CART = { id: 'c-1', subtotalCents: 249000, discountCents: 0, totalCents: 249000, promoCode: null };
const cartReply = (cartFields: Record<string, unknown>, ...items: Array<ReturnType<typeof serverItem>>) => ({
  status: 200,
  body: { cart: { ...CART, ...cartFields }, items },
});
const STORE_UNMOUNT_DELAY = 1000;
const stops: Array<() => void> = [];
const rub = (amount: number) => ({ amount, currency: 'RUB' });

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await vi.advanceTimersByTimeAsync(0);
};
const watch = <T>(store: ReadableStore<T>): void => {
  stops.push(watchSource(store)?.listen(() => undefined) ?? (() => undefined));
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
});

// Корзина c-1 с одной строкой l-1 (p12) по 1 шт., прочитанная по подписке на $count.
async function cartWithLine(quantity = 1) {
  const gateway = fakeGateway();
  localStorage.setItem(CART_ID_KEY, 'c-1');
  gateway.answer('GET /store/carts/c-1', cartReply({}, serverItem('l-1', 'p12', quantity)));
  const handle = fakeCore();
  const module = cart.create(handle.core);
  watch(module.$count);
  await settle();
  return { gateway, module, ...handle };
}

describe('cart.change', () => {
  it('PATCH, потом GET: строка и итоги — из ответа; merfy:cart:change — после ответа', async () => {
    const { gateway, module, named } = await cartWithLine();
    gateway.answer('PATCH /store/carts/c-1/items/l-1', { status: 200, body: { item: serverItem('l-1', 'p12', 3) } });
    gateway.answer('GET /store/carts/c-1', cartReply({ subtotalCents: 747000, totalCents: 747000 }, serverItem('l-1', 'p12', 3)));
    const result = await module.change({ lineId: 'l-1', quantity: 3 });
    expect(result).toEqual({ ok: true, data: { ready: true, lines: [cartLine('l-1', 'p12', 3)] } });
    expect(gateway.keys()).toEqual(['GET /store/carts/c-1', 'PATCH /store/carts/c-1/items/l-1', 'GET /store/carts/c-1']);
    expect(gateway.calls[1]?.body).toEqual({ quantity: 3 });
    expect(module.$totals.get()).toMatchObject({ ready: true, subtotal: rub(747000), total: rub(747000) });
    expect(module.$total.get()).toEqual(rub(747000));
    expect(named('merfy:cart:change')).toEqual([
      { lineId: 'l-1', productId: 'p12', variantId: null, quantity: 3, previousQuantity: 1 },
    ]);
  });

  it('счётчик — сразу, строка — после ответа', async () => {
    const { gateway, module } = await cartWithLine();
    const wait = gate();
    gateway.answer('PATCH /store/carts/c-1/items/l-1', { status: 200, body: {}, gate: wait.promise });
    gateway.answer('GET /store/carts/c-1', cartReply({}, serverItem('l-1', 'p12', 3)));
    const pending = module.change({ lineId: 'l-1', quantity: 3 });
    await settle();
    expect([module.$count.get(), module.$cart.get().lines[0]?.quantity]).toEqual([3, 1]);
    wait.open();
    await pending;
    expect([module.$count.get(), module.$cart.get().lines[0]?.quantity]).toEqual([3, 3]);
  });

  it('меньше — счётчик уменьшается сразу; сервер урезал до остатка — ok и предупреждение', async () => {
    const { gateway, module, named } = await cartWithLine(4);
    const wait = gate();
    gateway.answer('PATCH /store/carts/c-1/items/l-1', { status: 200, body: {}, gate: wait.promise });
    gateway.answer('GET /store/carts/c-1', cartReply({}, serverItem('l-1', 'p12', 2)));
    const pending = module.change({ lineId: 'l-1', quantity: 2 });
    await settle();
    expect(module.$count.get()).toBe(2);
    wait.open();
    await pending;
    gateway.answer('PATCH /store/carts/c-1/items/l-1', { status: 200, body: {} });
    gateway.answer('GET /store/carts/c-1', cartReply({}, serverItem('l-1', 'p12', 3)));
    const result = await module.change({ lineId: 'l-1', quantity: 5 });
    expect(result.ok).toBe(true);
    expect(module.$count.get()).toBe(3);
    expect(named('merfy:notice:show')).toEqual([{ level: 'warning', message: remainText(3) }]);
    expect(remainText(3)).toBe('Осталось 3 шт. — больше нет в наличии');
  });

  it('quantity: 0 — DELETE и merfy:cart:remove с прежним количеством', async () => {
    const { gateway, module, named } = await cartWithLine(2);
    gateway.answer('DELETE /store/carts/c-1/items/l-1', { status: 200, body: { success: true } });
    gateway.answer('GET /store/carts/c-1', cartReply({ subtotalCents: 0, totalCents: 0 }));
    expect(await module.change({ lineId: 'l-1', quantity: 0 })).toEqual({ ok: true, data: { ready: true, lines: [] } });
    expect(gateway.keys().slice(1)).toEqual(['DELETE /store/carts/c-1/items/l-1', 'GET /store/carts/c-1']);
    expect(named('merfy:cart:remove')).toEqual([{ lineId: 'l-1', productId: 'p12', variantId: null, quantity: 2 }]);
    expect([named('merfy:cart:change'), module.$count.get()]).toEqual([[], 0]);
  });

  it('ошибка сервера — счётчик обратно, уведомление, событий нет, строка прежняя', async () => {
    const { gateway, module, named } = await cartWithLine();
    gateway.answer('PATCH /store/carts/c-1/items/l-1', 'network');
    const result = await module.change({ lineId: 'l-1', quantity: 3 });
    expect(result).toEqual({ ok: false, error: { code: 'network', message: NOTICE_TEXT.network } });
    expect([module.$count.get(), module.$cart.get().lines[0]?.quantity]).toEqual([1, 1]);
    expect(named('merfy:notice:show')).toEqual([{ level: 'error', message: NOTICE_TEXT.network, code: 'network' }]);
    expect(named('merfy:cart:change')).toEqual([]);
  });

  it('неверные аргументы, чужая строка, подарок, то же количество — без запросов', async () => {
    const { gateway, module } = await cartWithLine();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const codes = [
      await module.change({ lineId: '', quantity: 1 }),
      await module.change({ lineId: 'l-1', quantity: -1 }),
      await module.change({ lineId: 'l-1', quantity: 1.5 }),
      await module.change({ lineId: 'l-9', quantity: 2 }),
      await module.remove({ lineId: '' }),
    ].map((result) => (result.ok ? 'ok' : result.error.code));
    expect(codes).toEqual(['invalid', 'invalid', 'invalid', 'invalid', 'invalid']);
    expect(await module.change({ lineId: 'l-1', quantity: 1 })).toMatchObject({ ok: true });
    expect(gateway.keys()).toEqual(['GET /store/carts/c-1']);
    expect(errorSpy.mock.calls.map(([text]) => String(text))).toEqual([
      'cart.change: lineId — непустая строка',
      'cart.change: quantity — целое число от 0',
      'cart.change: quantity — целое число от 0',
      'cart.change: строки l-9 в корзине нет',
      'cart.remove: lineId — непустая строка',
    ]);
  });

  it('подарок акции не меняется', async () => {
    const gateway = fakeGateway();
    localStorage.setItem(CART_ID_KEY, 'c-1');
    const giftItem = { ...serverItem('l-2', 'p12', 1), unitPriceCents: 0, totalCents: 0, isBonus: true };
    gateway.answer('GET /store/carts/c-1', { status: 200, body: { cart: CART, items: [giftItem] } });
    const module = cart.create(fakeCore().core);
    watch(module.$count);
    await settle();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = await module.remove({ lineId: 'l-2' });
    expect(result.ok ? null : result.error).toEqual({ code: 'invalid', message: 'cart.remove: подарок акции не меняется' });
  });
});

describe('cart.remove и разметка', () => {
  it('cart.remove — DELETE; разметка: cart.change — line-id и quantity, cart.remove — line-id', async () => {
    const { gateway, module, named } = await cartWithLine();
    gateway.answer('DELETE /store/carts/c-1/items/l-1', { status: 200, body: { success: true } });
    gateway.answer('GET /store/carts/c-1', cartReply({}));
    await cart.markup?.remove?.call(module, { 'line-id': 'l-1' });
    expect(named('merfy:cart:remove')).toHaveLength(1);
    expect([cart.markup?.change?.params, cart.markup?.remove?.params]).toEqual([['line-id', 'quantity'], ['line-id']]);
  });
});

describe('$totals и $total', () => {
  it('читаются по первой подписке; корзины нет — нули, готовы, без запроса', async () => {
    const gateway = fakeGateway();
    const module = cart.create(fakeCore().core);
    expect(module.$totals.get().ready).toBe(false);
    watch(module.$total);
    await settle();
    expect(module.$totals.get()).toEqual({
      ready: true,
      subtotal: rub(0),
      discount: rub(0),
      discountName: null,
      extensionDiscount: rub(0),
      total: rub(0),
    });
    expect(gateway.calls).toEqual([]);
  });

  it('после cart.add перечитываются, только пока на них подписаны', async () => {
    const gateway = fakeGateway();
    localStorage.setItem(CART_ID_KEY, 'c-1');
    const item = { status: 201, body: { item: serverItem('l-1', 'p12', 1) } };
    gateway.answer('GET /store/carts/c-1', cartReply({}), cartReply({}, serverItem('l-1', 'p12', 1)));
    gateway.answer('POST /store/carts/c-1/items', item, item);
    const module = cart.create(fakeCore().core);
    watch(module.$totals);
    await settle();
    await module.add({ productId: 'p12' });
    await settle();
    expect(gateway.keys()).toEqual(['GET /store/carts/c-1', 'POST /store/carts/c-1/items', 'GET /store/carts/c-1']);
    stops.splice(0).forEach((stop) => stop());
    await vi.advanceTimersByTimeAsync(STORE_UNMOUNT_DELAY * 2);
    await module.add({ productId: 'p12' });
    await settle();
    expect(gateway.keys()).toHaveLength(4);
  });
});

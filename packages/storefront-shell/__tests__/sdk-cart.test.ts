import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineSection } from '../src/core/define';
import { checkEventDetail } from '../src/core/event-catalog';
import { NOTICE_TEXT } from '../src/core/failures';
import { CART_ID_KEY, REREAD_AFTER_MS, cart } from '../src/core/parts/cart';
import { REQUEST_TIMEOUT_MS } from '../src/core/requests';
import { start, type StartedCore } from '../src/core/start';
import { watchSource } from '../src/core/stores';
import type { CartModule, CoreHandle } from '../src/core/types';
import { configTag, entry, placeSection, watchFailures } from './core-support';
import { SHOP_ID, cartLine, fakeCore, fakeGateway, field, gate, serverItem } from './sdk-support';

// Корзина на сервере (блок 9, 9.1–9.3; «Решил сам» пп. 1–9, 15): $cart — ответ шлюза, $count — штуки плюс ждущие ответа,
// cart.add — по одному запросу в порядке нажатий, ошибки — коды SDK и уведомления.
const CART = { id: 'c-1', shopId: SHOP_ID, status: 'cart' };
const created = { status: 201, body: { cart: CART } };
const itemReply = (quantity: number, variant: string | null = null) => ({
  status: 201,
  body: { item: serverItem('l-1', 'p12', quantity, variant) },
});
const cartReply = (...items: Array<ReturnType<typeof serverItem>>) => ({ status: 200, body: { cart: CART, items } });
const coded = (status: number, code: string) => ({ status, body: { success: false, code, message: 'текст сервера' } });

// Часы — поддельные во всём файле: стор отключается через 1 с после отписки последнего (Nano Stores), $count и за ним
// $cart — за 2 с; afterEach проматывает это время — слушатели страницы прошлых тестов не читают корзину в следующих.
const STORE_UNMOUNT_DELAY = 1000;
const stops: Array<() => void> = [];
let core: StartedCore | undefined;

// Дождаться ответов шлюза в памяти и продолжений после них.
const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await vi.advanceTimersByTimeAsync(0);
};

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});

afterEach(async () => {
  stops.splice(0).forEach((stop) => stop());
  core?.stop();
  core = undefined;
  await vi.advanceTimersByTimeAsync(STORE_UNMOUNT_DELAY * 2);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.head.replaceChildren();
  document.body.replaceChildren();
});

// Модуль корзины на странице и подписка на $count, как у «Значка корзины»: подписка запускает чтение корзины.
function openCart(handle: CoreHandle = fakeCore().core) {
  const module = cart.create(handle);
  const counts: number[] = [];
  const stop = watchSource(module.$count)?.listen((count) => counts.push(count));
  counts.push(module.$count.get());
  const unsubscribe = (): void => stop?.();
  stops.push(unsubscribe);
  return { module, counts, stop: unsubscribe };
}

describe('чтение корзины', () => {
  it('номера нет — пустая корзина без запроса', async () => {
    const gateway = fakeGateway();
    const { module } = openCart();
    await settle();
    expect(module.$cart.get()).toEqual({ ready: true, lines: [] });
    expect(module.$count.get()).toBe(0);
    expect(gateway.calls).toEqual([]);
  });

  it('номер есть — GET при первой подписке, не при создании; строки — из ответа шлюза', async () => {
    const gateway = fakeGateway();
    localStorage.setItem(CART_ID_KEY, 'c-1');
    gateway.answer(
      'GET /store/carts/c-1',
      cartReply(serverItem('l-1', 'p12', 2), serverItem('l-2', 'p12', 1, 'v-red')),
    );
    const module = cart.create(fakeCore().core);
    await settle();
    expect(gateway.calls).toEqual([]);
    stops.push(watchSource(module.$count)?.listen(() => undefined) ?? (() => undefined));
    await settle();
    expect(gateway.keys()).toEqual(['GET /store/carts/c-1']);
    expect(module.$cart.get()).toEqual({
      ready: true,
      lines: [cartLine('l-1', 'p12', 2), cartLine('l-2', 'p12', 1, 'v-red')],
    });
    expect(module.$count.get()).toBe(3);
    expect(Object.isFrozen(module.$cart.get().lines[0])).toBe(true);
  });

  it('корзины нет (404) — номер стёрт, корзина пустая', async () => {
    const gateway = fakeGateway();
    localStorage.setItem(CART_ID_KEY, 'c-gone');
    gateway.answer('GET /store/carts/c-gone', { status: 404, body: { message: 'Cart not found' } });
    const { module } = openCart();
    await settle();
    expect(module.$cart.get()).toEqual({ ready: true, lines: [] });
    expect(localStorage.getItem(CART_ID_KEY)).toBeNull();
  });

  it('фоновое чтение не удалось — ready: false, уведомления нет: покупатель ничего не делал', async () => {
    const gateway = fakeGateway();
    localStorage.setItem(CART_ID_KEY, 'c-1');
    gateway.answer('GET /store/carts/c-1', 'network');
    const fake = fakeCore();
    const { module } = openCart(fake.core);
    await settle();
    expect(module.$cart.get()).toEqual({ ready: false, lines: [] });
    expect(fake.events).toEqual([]);
  });
});

describe('cart.add', () => {
  it('без номера: новая корзина, номер в localStorage, строка в $cart и событие merfy:cart:add по каталогу', async () => {
    const gateway = fakeGateway();
    gateway.answer('POST /store/carts', created);
    gateway.answer('POST /store/carts/c-1/items', itemReply(2));
    const fake = fakeCore();
    const { module } = openCart(fake.core);
    const result = await module.add({ productId: 'p12', quantity: 2 });
    expect(gateway.calls).toEqual([
      { key: 'POST /store/carts', body: { store_id: SHOP_ID } },
      { key: 'POST /store/carts/c-1/items', body: { product_id: 'p12', quantity: 2 } },
    ]);
    expect(localStorage.getItem(CART_ID_KEY)).toBe('c-1');
    expect(result).toEqual({ ok: true, data: { ready: true, lines: [cartLine('l-1', 'p12', 2)] } });
    expect(fake.events).toEqual([
      {
        name: 'merfy:cart:add',
        detail: {
          lineId: 'l-1',
          productId: 'p12',
          variantId: null,
          quantity: 2,
          price: { amount: 249000, currency: 'RUB' },
        },
      },
    ]);
    expect(checkEventDetail('merfy:cart:add', fake.events[0]?.detail)).toBeNull();
  });

  it('порядок: стор → событие → ответ; подписчик события видит новый $count', async () => {
    const gateway = fakeGateway();
    gateway.answer('POST /store/carts', created);
    gateway.answer('POST /store/carts/c-1/items', itemReply(2));
    const log: string[] = [];
    const box: { module: CartModule | null } = { module: null };
    const fake = fakeCore();
    const handle: CoreHandle = {
      ...fake.core,
      emit: (name) => void log.push(`${name} ${box.module?.$count.get() ?? -1}`),
    };
    box.module = openCart(handle).module;
    await box.module.add({ productId: 'p12', quantity: 2 }).then(() => log.push('ответ'));
    expect(log).toEqual(['merfy:cart:add 2', 'ответ']);
  });

  it('счётчик меняется сразу, до ответа; ответ сервера — без промежуточного значения', async () => {
    const gateway = fakeGateway();
    const door = gate();
    gateway.answer('POST /store/carts', created);
    gateway.answer('POST /store/carts/c-1/items', { ...itemReply(2), gate: door.promise });
    const { module, counts } = openCart();
    const pending = module.add({ productId: 'p12', quantity: 2 });
    expect(counts).toEqual([0, 2]);
    await settle();
    expect(module.$cart.get().lines).toEqual([]);
    door.open();
    await pending;
    expect(counts).toEqual([0, 2]);
    expect(module.$cart.get().lines).toEqual([cartLine('l-1', 'p12', 2)]);
  });

  it('вариант — variant_id в запросе, variantId в строке и событии', async () => {
    const gateway = fakeGateway();
    gateway.answer('POST /store/carts', created);
    gateway.answer('POST /store/carts/c-1/items', itemReply(1, 'v-red'));
    const fake = fakeCore();
    const { module } = openCart(fake.core);
    await module.add({ productId: 'p12', variantId: 'v-red' });
    expect(gateway.calls[1]?.body).toEqual({ product_id: 'p12', quantity: 1, variant_id: 'v-red' });
    expect(fake.named('merfy:cart:add')).toEqual([
      { lineId: 'l-1', productId: 'p12', variantId: 'v-red', quantity: 1, price: { amount: 249000, currency: 'RUB' } },
    ]);
  });

  it('два быстрых «В корзину» — одна корзина, второй запрос — после ответа на первый', async () => {
    const gateway = fakeGateway();
    const door = gate();
    gateway.answer('POST /store/carts', created);
    gateway.answer('POST /store/carts/c-1/items', { ...itemReply(1), gate: door.promise }, itemReply(2));
    const fake = fakeCore();
    const { module, counts } = openCart(fake.core);
    const first = module.add({ productId: 'p12' });
    const second = module.add({ productId: 'p12' });
    await settle();
    expect(gateway.keys()).toEqual(['POST /store/carts', 'POST /store/carts/c-1/items']);
    expect(counts).toEqual([0, 1, 2]);
    door.open();
    await Promise.all([first, second]);
    expect(gateway.keys()).toEqual(['POST /store/carts', 'POST /store/carts/c-1/items', 'POST /store/carts/c-1/items']);
    expect(fake.named('merfy:cart:add').map((detail) => field(detail, 'quantity'))).toEqual([1, 1]);
    expect(module.$count.get()).toBe(2);
  });

  it('номер есть, корзина не прочитана — сначала GET; в событии — разница с прежним количеством', async () => {
    const gateway = fakeGateway();
    localStorage.setItem(CART_ID_KEY, 'c-1');
    gateway.answer('GET /store/carts/c-1', cartReply(serverItem('l-1', 'p12', 1)));
    gateway.answer('POST /store/carts/c-1/items', itemReply(3));
    const fake = fakeCore();
    const module = cart.create(fake.core);
    await module.add({ productId: 'p12', quantity: 2 });
    expect(gateway.keys()).toEqual(['GET /store/carts/c-1', 'POST /store/carts/c-1/items']);
    expect(fake.named('merfy:cart:add')).toEqual([
      { lineId: 'l-1', productId: 'p12', variantId: null, quantity: 2, price: { amount: 249000, currency: 'RUB' } },
    ]);
    expect(module.$count.get()).toBe(3);
  });

  it('корзины с номером больше нет (cart_not_found) — номер стёрт, новая корзина, одна попытка', async () => {
    const gateway = fakeGateway();
    localStorage.setItem(CART_ID_KEY, 'c-old');
    gateway.answer('GET /store/carts/c-old', cartReply());
    gateway.answer('POST /store/carts/c-old/items', coded(400, 'cart_not_found'));
    gateway.answer('POST /store/carts', created);
    gateway.answer('POST /store/carts/c-1/items', itemReply(1));
    const { module } = openCart();
    const result = await module.add({ productId: 'p12' });
    expect(gateway.keys()).toEqual([
      'GET /store/carts/c-old',
      'POST /store/carts/c-old/items',
      'POST /store/carts',
      'POST /store/carts/c-1/items',
    ]);
    expect(result.ok).toBe(true);
    expect(localStorage.getItem(CART_ID_KEY)).toBe('c-1');
  });

  it('cart_not_found и у новой корзины — server, третьей попытки нет', async () => {
    const gateway = fakeGateway();
    localStorage.setItem(CART_ID_KEY, 'c-old');
    gateway.answer('GET /store/carts/c-old', cartReply());
    gateway.answer('POST /store/carts/c-old/items', coded(400, 'cart_not_found'));
    gateway.answer('POST /store/carts', created);
    gateway.answer('POST /store/carts/c-1/items', coded(400, 'cart_not_found'));
    const { module } = openCart();
    const result = await module.add({ productId: 'p12' });
    expect(result).toMatchObject({ ok: false, error: { code: 'server' } });
    expect(gateway.keys()).toHaveLength(4);
  });

  it('обрыв: счётчик вернулся, уведомление «Нет связи…», события merfy:cart:add нет', async () => {
    const gateway = fakeGateway();
    gateway.answer('POST /store/carts', 'network');
    const fake = fakeCore();
    const { module, counts } = openCart(fake.core);
    const result = await module.add({ productId: 'p12', quantity: 2 });
    expect(result).toEqual({ ok: false, error: { code: 'network', message: NOTICE_TEXT.network } });
    expect(counts).toEqual([0, 2, 0]);
    expect(fake.events).toEqual([
      { name: 'merfy:notice:show', detail: { level: 'error', message: NOTICE_TEXT.network, code: 'network' } },
    ]);
  });

  it('нет ответа 10 с — network', async () => {
    const gateway = fakeGateway();
    gateway.answer('POST /store/carts', 'hang');
    const { module } = openCart();
    const pending = module.add({ productId: 'p12' });
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    expect(await pending).toMatchObject({ ok: false, error: { code: 'network' } });
    expect(module.$count.get()).toBe(0);
  });

  it.each([
    [coded(400, 'out_of_stock'), 'out-of-stock', NOTICE_TEXT['out-of-stock']],
    [{ status: 429, body: { message: 'Too Many Requests' } }, 'limit', NOTICE_TEXT['rate-limit']],
    [{ status: 500, body: null }, 'server', NOTICE_TEXT.server],
    [{ status: 400, body: { statusCode: 400, message: 'Товара нет в наличии' } }, 'server', NOTICE_TEXT.server],
    [{ status: 401, body: null }, 'unauthorized', NOTICE_TEXT.unauthorized],
  ])('ответ %j — код %s и уведомление «%s»', async (reply, code, text) => {
    const gateway = fakeGateway();
    gateway.answer('POST /store/carts', created);
    gateway.answer('POST /store/carts/c-1/items', reply);
    const fake = fakeCore();
    const { module } = openCart(fake.core);
    expect(await module.add({ productId: 'p12' })).toEqual({ ok: false, error: { code, message: text } });
    expect(fake.named('merfy:notice:show')).toEqual([{ level: 'error', message: text, code }]);
    expect(module.$count.get()).toBe(0);
  });

  it('товара нет (product_not_found) — invalid: покупателю ничего, автору — строка в консоли', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const gateway = fakeGateway();
    gateway.answer('POST /store/carts', created);
    gateway.answer('POST /store/carts/c-1/items', coded(400, 'product_not_found'));
    const fake = fakeCore();
    const { module } = openCart(fake.core);
    const result = await module.add({ productId: 'p404' });
    expect(result).toEqual({
      ok: false,
      error: { code: 'invalid', message: 'cart.add: товара p404 нет — проверьте productId' },
    });
    expect(fake.events).toEqual([]);
    expect(consoleError).toHaveBeenCalledWith('cart.add: товара p404 нет — проверьте productId');
  });

  it.each([
    [{ status: 201, body: { item: { id: 'l-1', productId: 'p12', quantity: 1 } } }],
    [{ status: 201, body: { item: { ...serverItem('l-1', 'p12', 1), variantCombinationId: 7 } } }],
    [{ status: 201, body: { item: { ...serverItem('l-1', 'p12', 1), quantity: -1 } } }],
    [{ status: 201, body: {} }],
  ])('ответ добавления не по форме %j — server', async (reply) => {
    const gateway = fakeGateway();
    gateway.answer('POST /store/carts', created);
    gateway.answer('POST /store/carts/c-1/items', reply);
    const { module } = openCart();
    expect(await module.add({ productId: 'p12' })).toMatchObject({ ok: false, error: { code: 'server' } });
    expect(module.$count.get()).toBe(0);
  });

  it.each([
    [{ status: 200, body: { cart: CART, items: [{ id: 'l-1' }] } }],
    [{ status: 200, body: { cart: CART } }],
    [{ status: 201, body: { cart: {} } }],
  ])('ответ корзины не по форме %j — server', async (reply) => {
    const gateway = fakeGateway();
    localStorage.setItem(CART_ID_KEY, 'c-1');
    gateway.answer('GET /store/carts/c-1', reply.status === 200 ? reply : cartReply());
    gateway.answer('POST /store/carts/c-1/items', coded(400, 'cart_not_found'));
    gateway.answer('POST /store/carts', reply);
    const { module } = openCart();
    expect(await module.add({ productId: 'p12' })).toMatchObject({ ok: false, error: { code: 'server' } });
  });

  it('сервер урезал количество до остатка — ok и предупреждение; в событии — сколько добавилось', async () => {
    const gateway = fakeGateway();
    localStorage.setItem(CART_ID_KEY, 'c-1');
    gateway.answer('GET /store/carts/c-1', cartReply(serverItem('l-1', 'p12', 1)));
    gateway.answer('POST /store/carts/c-1/items', itemReply(2));
    const fake = fakeCore();
    const { module } = openCart(fake.core);
    const result = await module.add({ productId: 'p12', quantity: 3 });
    expect(result).toEqual({ ok: true, data: { ready: true, lines: [cartLine('l-1', 'p12', 2)] } });
    expect(fake.events.map((event) => event.name)).toEqual(['merfy:cart:add', 'merfy:notice:show']);
    expect(fake.named('merfy:notice:show')).toEqual([
      { level: 'warning', message: 'Добавили 1 шт. — больше нет в наличии' },
    ]);
    expect(field(fake.named('merfy:cart:add')[0], 'quantity')).toBe(1);
    expect(module.$count.get()).toBe(2);
  });

  it('ничего не добавилось — limit «Больше нет в наличии», события нет', async () => {
    const gateway = fakeGateway();
    localStorage.setItem(CART_ID_KEY, 'c-1');
    gateway.answer('GET /store/carts/c-1', cartReply(serverItem('l-1', 'p12', 2)));
    gateway.answer('POST /store/carts/c-1/items', itemReply(2));
    const fake = fakeCore();
    const { module, counts } = openCart(fake.core);
    await settle();
    const result = await module.add({ productId: 'p12' });
    expect(result).toEqual({ ok: false, error: { code: 'limit', message: 'Больше нет в наличии' } });
    expect(fake.events).toEqual([
      { name: 'merfy:notice:show', detail: { level: 'error', message: 'Больше нет в наличии', code: 'limit' } },
    ]);
    expect(counts).toEqual([0, 2, 3, 2]);
  });

  it('quiet — уведомлений нет, ответ тот же', async () => {
    const gateway = fakeGateway();
    gateway.answer('POST /store/carts', 'network');
    const fake = fakeCore();
    const { module } = openCart(fake.core);
    const result = await module.add({ productId: 'p12' }, { quiet: true });
    expect(result).toMatchObject({ ok: false, error: { code: 'network' } });
    expect(fake.events).toEqual([]);
  });

  it.each([
    ['пустой productId', { productId: '' }, 'cart.add: productId — непустая строка'],
    ['пустой variantId', { productId: 'p12', variantId: '' }, 'cart.add: variantId — непустая строка'],
    ['количество 0', { productId: 'p12', quantity: 0 }, 'cart.add: quantity — целое число от 1'],
    ['дробное количество', { productId: 'p12', quantity: 1.5 }, 'cart.add: quantity — целое число от 1'],
  ])('%s — invalid без запроса, счётчик прежний', async (_case, args, message) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const gateway = fakeGateway();
    const fake = fakeCore();
    const { module, counts } = openCart(fake.core);
    expect(await module.add(args)).toEqual({ ok: false, error: { code: 'invalid', message } });
    expect(gateway.calls).toEqual([]);
    expect(counts).toEqual([0]);
    expect(fake.events).toEqual([]);
  });

  it('конфиг не прочитан — server и уведомление, без запроса', async () => {
    const gateway = fakeGateway();
    const fake = fakeCore('live', null);
    const module = cart.create(fake.core);
    expect(await module.add({ productId: 'p12' })).toMatchObject({ ok: false, error: { code: 'server' } });
    expect(gateway.calls).toEqual([]);
    expect(fake.named('merfy:notice:show')).toHaveLength(1);
  });

  it('превью — номер корзины в памяти страницы: localStorage мерчанта не трогаем', async () => {
    const gateway = fakeGateway();
    gateway.answer('POST /store/carts', created);
    gateway.answer('POST /store/carts/c-1/items', itemReply(1), itemReply(2));
    const { module } = openCart(fakeCore('preview').core);
    await module.add({ productId: 'p12' });
    await module.add({ productId: 'p12' });
    expect(localStorage.length).toBe(0);
    expect(gateway.keys().filter((key) => key === 'POST /store/carts')).toHaveLength(1);
  });

  it('подписчик стора бросил — cart.add не бросил, ответ ok, строка в консоли', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const gateway = fakeGateway();
    gateway.answer('POST /store/carts', created);
    gateway.answer('POST /store/carts/c-1/items', itemReply(1));
    const { module } = openCart();
    const stop = watchSource(module.$count)?.listen(() => {
      throw new Error('значок сломался');
    });
    stops.push(() => stop?.());
    const result = await module.add({ productId: 'p12' });
    expect(result.ok).toBe(true);
    expect(consoleError).toHaveBeenCalledWith('Подписчик стора корзины: значок сломался');
  });
});

describe('перечитывание корзины', () => {
  const visible = (): boolean => document.dispatchEvent(new Event('visibilitychange'));

  it('вкладку вернули позже 30 с после чтения — GET; раньше — нет', async () => {
    const gateway = fakeGateway();
    localStorage.setItem(CART_ID_KEY, 'c-1');
    gateway.answer('GET /store/carts/c-1', cartReply(), cartReply(serverItem('l-1', 'p12', 1)));
    const { module } = openCart();
    await settle();
    await vi.advanceTimersByTimeAsync(REREAD_AFTER_MS - 1000);
    visible();
    await settle();
    expect(gateway.keys()).toEqual(['GET /store/carts/c-1']);
    await vi.advanceTimersByTimeAsync(2000);
    visible();
    await settle();
    expect(gateway.keys()).toEqual(['GET /store/carts/c-1', 'GET /store/carts/c-1']);
    expect(module.$count.get()).toBe(1);
    expect(REREAD_AFTER_MS).toBe(30_000);
  });

  it('«Назад» из кеша браузера (pageshow с persisted) — GET', async () => {
    const gateway = fakeGateway();
    localStorage.setItem(CART_ID_KEY, 'c-1');
    gateway.answer('GET /store/carts/c-1', cartReply(), cartReply(serverItem('l-1', 'p12', 2)));
    const { module } = openCart();
    await settle();
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));
    await settle();
    expect(gateway.keys()).toHaveLength(1);
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    await settle();
    expect(gateway.keys()).toHaveLength(2);
    expect(module.$count.get()).toBe(2);
  });

  it('другая вкладка сменила номер корзины (storage) — GET по новому номеру', async () => {
    const gateway = fakeGateway();
    gateway.answer('GET /store/carts/c-2', cartReply(serverItem('l-9', 'p7', 1)));
    const { module } = openCart();
    await settle();
    localStorage.setItem(CART_ID_KEY, 'c-2');
    window.dispatchEvent(new StorageEvent('storage', { key: 'other-key' }));
    window.dispatchEvent(new StorageEvent('storage', { key: CART_ID_KEY }));
    await settle();
    expect(gateway.keys()).toEqual(['GET /store/carts/c-2']);
    expect(module.$cart.get().lines).toEqual([cartLine('l-9', 'p7', 1)]);
  });

  it('корзину никто не читает — события страницы её не перечитывают', async () => {
    const gateway = fakeGateway();
    localStorage.setItem(CART_ID_KEY, 'c-1');
    gateway.answer('GET /store/carts/c-1', cartReply());
    const { stop } = openCart();
    await settle();
    stop();
    // $count отключается через 1 с после отписки, $cart — ещё через 1 с (Nano Stores, STORE_UNMOUNT_DELAY).
    await vi.advanceTimersByTimeAsync(STORE_UNMOUNT_DELAY * 2);
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    await settle();
    expect(gateway.keys()).toEqual(['GET /store/carts/c-1']);
  });
});

describe('разметка и секции', () => {
  it('data-action="cart.add": параметры product-id, variant-id, quantity; quantity — число из строки', async () => {
    const gateway = fakeGateway();
    gateway.answer('POST /store/carts', created);
    gateway.answer('POST /store/carts/c-1/items', itemReply(2, 'v-red'));
    const module = cart.create(fakeCore().core);
    const add = cart.markup?.add;
    expect(add?.params).toEqual(['product-id', 'variant-id', 'quantity']);
    const result = await add?.call(module, { 'product-id': 'p12', 'variant-id': 'v-red', quantity: '2' });
    expect(result?.ok).toBe(true);
    expect(gateway.calls[1]?.body).toEqual({ product_id: 'p12', quantity: 2, variant_id: 'v-red' });
  });

  it('data-quantity не число — invalid без запроса', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const gateway = fakeGateway();
    const module = cart.create(fakeCore().core);
    const result = await cart.markup?.add?.call(module, { 'product-id': 'p12', quantity: 'два' });
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid' } });
    expect(gateway.calls).toEqual([]);
  });

  it('секция упала в ctx.watch — её сбой у неё, cart.add ответил ok, значок соседа обновился', async () => {
    const failures = watchFailures();
    const gateway = fakeGateway();
    gateway.answer('POST /store/carts', created);
    gateway.answer('POST /store/carts/c-1/items', itemReply(1));
    document.head.innerHTML = configTag('preview');
    const broken = placeSection('shop:broken-badge', 'broken-1');
    const badge = placeSection('shop:badge', 'badge-1', '<span data-ref="count">0</span>');
    const box: { cart: CartModule | null } = { cart: null };
    const brokenBadge = defineSection({
      mount(_el, ctx) {
        box.cart = ctx.cart;
        ctx.watch(ctx.cart.$count, (count) => {
          if (count > 0) throw new Error('значок сломался');
        });
      },
    });
    const goodBadge = defineSection({
      mount: (_el, ctx) => void ctx.watch(ctx.cart.$count, (count) => ctx.ref('count')?.text(count)),
    });
    core = start({
      parts: [cart],
      sections: [
        entry('shop:broken-badge', brokenBadge, { uses: ['cart'] }),
        entry('shop:badge', goodBadge, { uses: ['cart'] }),
      ],
    });
    const result = await box.cart?.add({ productId: 'p12' });
    failures.stop();
    expect(result?.ok).toBe(true);
    expect(broken.getAttribute('data-merfy-state')).toBe('failed');
    expect(failures.details.map((detail) => `${detail.section} ${detail.stage}`)).toEqual([
      'shop:broken-badge runtime',
    ]);
    expect(badge.querySelector('[data-ref="count"]')?.textContent).toBe('1');
  });
});

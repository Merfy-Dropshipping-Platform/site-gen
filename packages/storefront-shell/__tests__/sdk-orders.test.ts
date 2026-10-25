import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTIONS, MODULE_NAMES, markupParams } from '../src/core/action-catalog';
import { CUSTOMER_TOKEN_KEY } from '../src/core/customer-token';
import { ORDER_MISSING_TEXT, orderOf, orders, shipmentCancellable } from '../src/core/parts/orders';
import { SHOP_ID, fakeCore, fakeGateway } from './sdk-support';

// Заказы покупательницы (блок 10 «Секций и SDK», 10.8, «Решил сам» п. 20; часть 10в, Р10в-7, Р10в-8): /store/orders
// шлюза с токеном; вид заказа — как у страницы заказа flux; «Отменить» — по статусу и правилу перевозчика.
const TOKEN = 't-customer-1';
const ORDER = {
  orderNumber: '1042',
  createdAt: '2026-10-20T10:00:00.000Z',
  status: 'paid',
  totalCents: 498000,
  shippingAddress: { city: 'Москва', street: 'Тверская', building: '7' },
  deliveryStatus: null,
  items: [
    {
      name: 'Шарф «Нова»',
      imageUrl: 'https://minio.dev.merfy.ru/scarves/nova.jpg',
      options: { Цвет: 'Красный' },
      quantity: 2,
      totalCents: 498000,
      isBonus: false,
    },
    { name: 'Платок', imageUrl: null, options: null, quantity: 1, totalCents: 0, isBonus: true },
  ],
};

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('заказы', () => {
  it('list — GET /store/orders с магазином, take и токеном; список или { items }; статус текстом, сумма', async () => {
    localStorage.setItem(CUSTOMER_TOKEN_KEY, TOKEN);
    const gateway = fakeGateway();
    gateway.answer(
      'GET /store/orders',
      { status: 200, body: { success: true, data: [ORDER] } },
      { status: 200, body: { success: true, data: { items: [{ ...ORDER, status: 'sent' }] } } },
    );
    const module = orders.create(fakeCore().core);
    expect(await module.list()).toEqual({
      ok: true,
      data: {
        orders: [
          {
            number: '1042',
            createdAt: ORDER.createdAt,
            status: 'paid',
            statusText: 'Оплачен',
            total: { amount: 498000, currency: 'RUB' },
          },
        ],
      },
    });
    const url = new URL(String(vi.mocked(fetch).mock.calls[0]?.[0]));
    expect([url.searchParams.get('store_id'), url.searchParams.get('take')]).toEqual([SHOP_ID, '50']);
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.headers).toEqual({ authorization: `Bearer ${TOKEN}` });
    const second = await module.list();
    expect(second.ok ? second.data.orders[0]?.statusText : null).toBe('Отправлен');
  });

  it('get — строки, подарок, адрес; «Отменить» — paid без отправления', async () => {
    localStorage.setItem(CUSTOMER_TOKEN_KEY, TOKEN);
    const gateway = fakeGateway();
    gateway.answer('GET /store/orders/1042', { status: 200, body: { success: true, data: ORDER } });
    const result = await orders.create(fakeCore().core).get({ number: '1042' });
    expect(gateway.keys()).toEqual(['GET /store/orders/1042']);
    if (!result.ok) throw new Error('ожидался заказ');
    expect(result.data.order.lines.map((line) => [line.title, line.quantity, line.gift, line.options])).toEqual([
      ['Шарф «Нова»', 2, false, { Цвет: 'Красный' }],
      ['Платок', 1, true, {}],
    ]);
    expect([result.data.order.address, result.data.order.canCancel]).toEqual(['Москва, Тверская, д. 7', true]);
  });

  it('«Отменить»: статус и правило перевозчика', () => {
    const can = (fields: Record<string, unknown>): boolean | undefined =>
      orderOf({ ...ORDER, ...fields }, 'RUB')?.canCancel;
    expect([can({ status: 'processing' }), can({ status: 'sent' }), can({ status: 'pending' })]).toEqual([
      true,
      false,
      false,
    ]);
    expect([
      can({ deliveryStatus: 'CREATED' }),
      can({ deliveryStatus: 'IN_TRANSIT' }),
      can({ shipmentCancellable: false }),
    ]).toEqual([true, false, false]);
    expect(shipmentCancellable({ shipmentCancellable: true, deliveryStatus: 'DELIVERED' })).toBe(true);
    expect(orderOf({ ...ORDER, shippingAddress: null, pickupPointAddress: 'ПВЗ на Ленина, 1' }, 'RUB')?.address).toBe(
      'ПВЗ на Ленина, 1',
    );
    expect(orderOf({ orderNumber: 7 }, 'RUB')).toBeNull();
  });

  it('cancel — POST …/cancel с причиной, потом заказ заново; пустая причина — без запроса', async () => {
    localStorage.setItem(CUSTOMER_TOKEN_KEY, TOKEN);
    const gateway = fakeGateway();
    gateway.answer('POST /store/orders/1042/cancel', { status: 200, body: { success: true } });
    gateway.answer('GET /store/orders/1042', {
      status: 200,
      body: { success: true, data: { ...ORDER, status: 'cancelled' } },
    });
    const module = orders.create(fakeCore().core);
    expect((await module.cancel({ number: '1042', reason: '  ' }, { quiet: true })).ok).toBe(false);
    const result = await module.cancel({ number: '1042', reason: 'Передумала' });
    expect(gateway.calls).toEqual([
      { key: 'POST /store/orders/1042/cancel', body: { reason: 'Передумала' } },
      { key: 'GET /store/orders/1042', body: null },
    ]);
    expect(result.ok ? result.data.order.statusText : null).toBe('Отменён');
  });

  it('нет токена — unauthorized без запроса; 401 — токен удалён, merfy:auth:signout; 404 — «Заказ не найден»', async () => {
    const gateway = fakeGateway();
    const { core, named } = fakeCore();
    const module = orders.create(core);
    const guest = await module.list({ quiet: true });
    expect([guest.ok ? null : guest.error.code, gateway.calls.length]).toEqual(['unauthorized', 0]);
    localStorage.setItem(CUSTOMER_TOKEN_KEY, TOKEN);
    gateway.answer('GET /store/orders/9', { status: 404, body: { success: false, error: 'Order not found' } });
    expect(await module.get({ number: '9' }, { quiet: true })).toEqual({
      ok: false,
      error: { code: 'refused', message: ORDER_MISSING_TEXT },
    });
    gateway.answer('GET /store/orders', { status: 401, body: { message: 'Invalid or expired session' } });
    await module.list({ quiet: true });
    expect(localStorage.getItem(CUSTOMER_TOKEN_KEY)).toBeNull();
    expect(named('merfy:auth:signout')).toEqual([{}]);
  });
});

describe('таблица действий и модули блока 10в', () => {
  it('действия входа и кабинета — модули auth и orders; разметка — только у auth.signout', () => {
    const names = [
      'auth.requestCode',
      'auth.verify',
      'auth.signout',
      'auth.updateProfile',
      'orders.list',
      'orders.get',
      'orders.cancel',
    ] as const;
    expect(names.map((name) => ACTIONS[name].module)).toEqual([
      'auth',
      'auth',
      'auth',
      'auth',
      'orders',
      'orders',
      'orders',
    ]);
    expect(names.filter((name) => ACTIONS[name].markup !== null)).toEqual(['auth.signout']);
    expect(markupParams('auth.signout')).toEqual([]);
    expect(MODULE_NAMES).toContain('orders');
  });
});

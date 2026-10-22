import { describe, expect, it } from 'vitest';
import { BILLING_QUEUE, fetchBilling } from '../src/billing';
import type { LogFields } from '../src/log';

// Оплата онлайн для значков подвала (блок 1 «Секций и SDK», часть 4, Р1-4-6): правило — как у подвала пяти тем.
const SHOP = '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70';

function requestOf(answer: unknown) {
  const calls: unknown[][] = [];
  const logged: [string, LogFields][] = [];
  const request = {
    call: (...args: unknown[]) => {
      calls.push(args);
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    },
    timeoutMs: 4_000,
    log: (event: string, fields: LogFields = {}) => {
      logged.push([event, fields]);
    },
  };
  return { request, calls, logged };
}

const onlineOf = async (answer: unknown): Promise<unknown> =>
  (await fetchBilling(requestOf(answer).request, SHOP)).data.online;

describe('оплата онлайн магазина', () => {
  it('публичные настройки оплаты billing: activeProvider, иначе ЮKassa с номером магазина', async () => {
    const { request, calls } = requestOf({ success: true, activeProvider: 'yookassa' });
    expect(await fetchBilling(request, SHOP)).toEqual({
      type: 'billing',
      id: 'main',
      updatedAt: '1970-01-01T00:00:00.000Z',
      data: { online: true },
    });
    expect(calls).toEqual([[BILLING_QUEUE, 'billing.shop_payment_settings.get_public', { shopId: SHOP }, 4_000]]);
    expect(await onlineOf({ success: true, activeProvider: null, yookassaEnabled: true, yookassaShopId: '1' })).toBe(
      false,
    );
    expect(await onlineOf({ success: true, yookassaEnabled: true, yookassaShopId: '123456' })).toBe(true);
    expect(await onlineOf({ success: true, yookassaEnabled: true, yookassaShopId: null })).toBe(false);
    expect(await onlineOf({ success: false, activeProvider: 'yookassa' })).toBe(false);
  });

  it('billing не ответил или ответил не по форме — оплаты нет, строка журнала billing-failed', async () => {
    const { request, logged } = requestOf(new Error('тайм-аут'));
    expect((await fetchBilling(request, SHOP)).data.online).toBe(false);
    expect(logged).toEqual([['billing-failed', { shopId: SHOP, error: 'тайм-аут' }]]);
    expect(await onlineOf({ yookassaEnabled: true })).toBe(false);
  });
});

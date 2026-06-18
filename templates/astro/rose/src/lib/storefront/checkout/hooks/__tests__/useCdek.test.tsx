import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { CheckoutProvider, useCheckoutContext } from '../../CheckoutContext';
import { useCdek } from '../useCdek';

/**
 * Проверяет, что useCdek читает РЕАЛЬНЫЙ контракт расчёта
 * (deliveryOptions/pickupPoints/unavailableProducts/cdekError) и раскладывает
 * его в единый список choices: OWN→custom, PARTNER door/pickup (с cdekTariffCode),
 * pickupPoints→самовывоз; цена price(₽)→копейки.
 */
const calcResponse = {
  success: true,
  data: {
    deliveryOptions: [
      { id: 'own-1', name: 'Курьер по городу', type: 'OWN', price: 300, minDays: 1, maxDays: 2, description: 'Своя доставка' },
      { id: 'cdek-137', name: 'СДЭК до двери', type: 'PARTNER', price: 390, minDays: 2, maxDays: 4, cdekTariffCode: 137, deliveryMode: 'door' },
      { id: 'cdek-136', name: 'СДЭК ПВЗ', type: 'PARTNER', price: 290, minDays: 3, maxDays: 5, cdekTariffCode: 136, deliveryMode: 'pickup' },
    ],
    pickupPoints: [{ id: 'pp1', address: 'ул. Ленина 1', city: 'Москва', estimatedReadyTime: 'HOURS_24' }],
    unavailableProducts: [{ productId: 'p1' }],
    cdekError: 'Не удалось рассчитать доставку СДЭК',
  },
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <CheckoutProvider apiBase="http://api.test/api" shopId="shop-1" initialCartId="cart-1">
    {children}
  </CheckoutProvider>
);

const useHarness = () => {
  const { dispatch } = useCheckoutContext();
  const cdek = useCdek();
  return { dispatch, cdek };
};

beforeEach(() => {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/delivery/calculate')) {
      return { ok: true, json: async () => calcResponse } as Response;
    }
    // yookassa payment-config (mount) и прочее
    return { ok: true, json: async () => ({ data: {} }) } as Response;
  }) as unknown as typeof fetch;
});

describe('useCdek — маппинг реального контракта calculate', () => {
  it('раскладывает OWN/PARTNER/самовывоз в choices + пробрасывает cdekError/unavailableProducts', async () => {
    const { result } = renderHook(() => useHarness(), { wrapper });

    // Выбор города (FIAS) триггерит авто-расчёт.
    act(() => {
      result.current.dispatch({ type: 'SET_DELIVERY_FIELD', field: 'cityFiasId', value: 'fias-1' });
    });

    await waitFor(() => expect(result.current.cdek.choices.length).toBeGreaterThan(0));

    const choices = result.current.cdek.choices;

    // OWN → custom
    const own = choices.find((c) => c.type === 'custom');
    expect(own?.customId).toBe('own-1');
    expect(own?.priceCents).toBe(30000); // 300₽ → копейки

    // PARTNER door → cdek_door + cdekTariffCode
    const door = choices.find((c) => c.type === 'cdek_door');
    expect(door?.cdekTariffCode).toBe(137);
    expect(door?.priceCents).toBe(39000);

    // PARTNER pickup → cdek_pvz + cdekTariffCode
    const pvz = choices.find((c) => c.type === 'cdek_pvz');
    expect(pvz?.cdekTariffCode).toBe(136);

    // самовывоз
    expect(choices.find((c) => c.type === 'pickup')?.label).toBe('Самовывоз');

    // мягкие поля
    expect(result.current.cdek.cdekError).toBe('Не удалось рассчитать доставку СДЭК');
    expect(result.current.cdek.unavailableProducts).toHaveLength(1);
  });

  it('несколько точек самовывоза → лейблы разведены (без коллизии выбора)', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          deliveryOptions: [],
          pickupPoints: [
            { id: 'a', address: 'ул. Ленина 1', city: 'Москва', estimatedReadyTime: 'HOURS_24' },
            { id: 'b', address: 'пр. Мира 2', city: 'Химки', estimatedReadyTime: 'HOURS_24' },
          ],
        },
      }),
    })) as unknown as typeof fetch;
    const { result } = renderHook(() => useHarness(), { wrapper });
    act(() => result.current.dispatch({ type: 'SET_DELIVERY_FIELD', field: 'cityFiasId', value: 'fias-1' }));
    await waitFor(() => expect(result.current.cdek.choices.length).toBe(2));
    const labels = result.current.cdek.choices.map((c) => c.label);
    expect(new Set(labels).size).toBe(2); // уникальны → нет коллизии selected
    expect(labels.every((l) => l.startsWith('Самовывоз'))).toBe(true);
  });

  it('пустой ответ + cdekError → choices пуст, cdekError проброшен', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        data: { deliveryOptions: [], cdekError: 'СДЭК временно недоступен' },
      }),
    })) as unknown as typeof fetch;
    const { result } = renderHook(() => useHarness(), { wrapper });
    act(() => result.current.dispatch({ type: 'SET_DELIVERY_FIELD', field: 'cityFiasId', value: 'fias-1' }));
    await waitFor(() => expect(result.current.cdek.cdekError).toBe('СДЭК временно недоступен'));
    expect(result.current.cdek.choices).toHaveLength(0);
  });
});

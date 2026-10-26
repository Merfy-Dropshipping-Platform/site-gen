import type { StorefrontConfig } from '@merfy/storefront-config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SOLD_CACHE_KEY, soldByFormOf } from '../src/core/sold-by-form';
import type { CoreHandle, Mode } from '../src/core/types';

// Товар продаётся формой расширения (блок 15, часть 15г, Р15г-1; extension-sale.ts пяти тем на dev): места — из конфига
// страницы, функция формы точки product, кэш вкладки на 5 минут, до 4 запросов разом, сбой — «нет» без запоминания.
const SHOP = '3a9626f7-390d-4a66-bca5-a3b806ca6c1b';
const API = 'https://gateway.dev.merfy.ru/api';
const FORM_URL = `${API}/store/extensions/test-ext/fn/productForm?store_id=${SHOP}`;
const MAP: NonNullable<StorefrontConfig['extPoints']> = {
  'other-ext': { cart: { note: { text: 'x' } } },
  'test-ext': { product: { form: 'productForm' } },
};

function coreOf(mode: Mode = 'live', extPoints: StorefrontConfig['extPoints'] = MAP): CoreHandle {
  return {
    config: {
      v: 1,
      mode,
      shop: { id: SHOP, name: 'Магазин', url: null },
      currency: 'RUB',
      locale: 'ru-RU',
      api: { url: API },
      theme: { id: 'nova', version: '0.1.0' },
      page: { id: 'catalog', path: '/catalog' },
      analytics: null,
      ...(extPoints === undefined ? {} : { extPoints }),
    },
    mode,
    emit: vi.fn(),
    part: () => {
      throw new Error('part не нужен этому тесту');
    },
  };
}

const answer = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const bodyText = (init: RequestInit | undefined): string => (typeof init?.body === 'string' ? init.body : '');

// productId из тела запроса функции формы; не строка — пустая строка.
function productIdOf(init: RequestInit | undefined): string {
  const parsed: unknown = JSON.parse(bodyText(init));
  if (typeof parsed !== 'object' || parsed === null || !('productId' in parsed)) return '';
  const value: unknown = Reflect.get(parsed, 'productId');
  return typeof value === 'string' ? value : '';
}

// storeId и время записи кэша вкладки; записи нет — нули.
function cacheEntryOf(raw: string | null): { storeId: string; at: number } {
  const parsed: unknown = JSON.parse(raw ?? '{}');
  if (typeof parsed !== 'object' || parsed === null) return { storeId: '', at: 0 };
  const storeId: unknown = Reflect.get(parsed, 'storeId');
  const at: unknown = Reflect.get(parsed, 'at');
  return typeof storeId === 'string' && typeof at === 'number' ? { storeId, at } : { storeId: '', at: 0 };
}

// Форма — у товаров из sold; остальным — null.
function stub(sold: readonly string[]) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    void url;
    return Promise.resolve(answer({ success: true, data: sold.includes(productIdOf(init)) ? { title: 'Заявка' } : null }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('sold-by-form', () => {
  it('товар с формой — да, без формы — нет; запроса карты нет; ответ запомнен', async () => {
    const fetchMock = stub(['p-1']);
    const sold = soldByFormOf(coreOf());
    expect(sold.known('p-1')).toBeUndefined();
    expect(await Promise.all([sold.check('p-1'), sold.check('p-2'), sold.check('p-1')])).toEqual([true, false, true]);
    expect(fetchMock.mock.calls.every(([url]) => url === FORM_URL)).toBe(true);
    expect(fetchMock.mock.calls.filter(([url]) => url === FORM_URL)).toHaveLength(2);
    expect([sold.known('p-1'), sold.known('p-2')]).toEqual([true, false]);
    expect(soldByFormOf(coreOf()).known('p-1')).toBe(true); // кэш вкладки: новое ядро той же вкладки знает ответ
  });

  it('кэш вкладки — пять минут и только своего магазина', async () => {
    stub(['p-1']);
    await soldByFormOf(coreOf()).check('p-1');
    const saved: { storeId: string; at: number } = cacheEntryOf(sessionStorage.getItem(SOLD_CACHE_KEY));
    sessionStorage.setItem(SOLD_CACHE_KEY, JSON.stringify({ ...saved, at: saved.at - 5 * 60 * 1000 - 1 }));
    expect(soldByFormOf(coreOf()).known('p-1')).toBeUndefined();
    sessionStorage.setItem(SOLD_CACHE_KEY, JSON.stringify({ ...saved, storeId: 'other-shop' }));
    expect(soldByFormOf(coreOf()).known('p-1')).toBeUndefined();
  });

  it('не больше четырёх запросов функции формы разом', async () => {
    let open = 0;
    let peak = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        open += 1;
        peak = Math.max(peak, open);
        await new Promise((resolve) => setTimeout(resolve, 5));
        open -= 1;
        return answer({ success: true, data: null });
      }),
    );
    const sold = soldByFormOf(coreOf());
    await Promise.all(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => sold.check(id)));
    expect(peak).toBe(4);
  });

  it('мест product в конфиге нет — нет, без запросов', async () => {
    const fetchMock = stub(['p-1']);
    expect(await soldByFormOf(coreOf('live', { 'other-ext': { cart: { note: { text: 'x' } } } })).check('p-1')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('успех функции формы — любой 2xx: 201 с формой — да, кнопка «В корзину» прячется', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ success: true, data: { title: 'Заявка' } }), { status: 201 }))),
    );
    const sold = soldByFormOf(coreOf());
    expect(await sold.check('p-1')).toBe(true);
    expect(sold.known('p-1')).toBe(true);
  });

  it('не 2xx — нет: 204, 500 и обрыв не считаются формой', async () => {
    for (const status of [204, 500]) {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            new Response(status === 204 ? null : JSON.stringify({ success: true, data: { title: 'Заявка' } }), { status }),
          ),
        ),
      );
      const sold = soldByFormOf(coreOf());
      expect(await sold.check('p-1')).toBe(false);
      expect(sold.known('p-1')).toBe(false);
    }
  });

  it('сбой сети — нет и без запоминания: следующий вызов спрашивает снова', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('сеть'))),
    );
    const sold = soldByFormOf(coreOf());
    expect(await sold.check('p-1')).toBe(false);
    expect(sold.known('p-1')).toBeUndefined();
  });

  it('превью — нет, без запросов', async () => {
    const fetchMock = stub(['p-1']);
    expect(await soldByFormOf(coreOf('preview')).check('p-1')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

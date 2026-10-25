import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalog, storeQueryOf } from '../src/core/parts/catalog';
import { API_URL, SHOP_ID, fakeCore } from './sdk-support';

// Модуль «Каталог» для своих секций (блок 11 «Секций и SDK», часть 11б, п. 13): /store/products и /store/filters шлюза.
const rub = (amount: number) => ({
  amount,
  currency: 'RUB',
  text: `${Math.round(amount / 100).toLocaleString('ru-RU')} ₽`,
});
const ITEM = {
  id: 'p-1',
  title: 'Шарф',
  handle: 'sharf',
  images: [],
  basePrice: 1900,
  compareAtPrice: null,
  hasVariants: false,
  quantity: 3,
  allowBackorder: false,
  sku: 'SKU-1',
};

function gateway(body: unknown, status = 200) {
  const urls: URL[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) => {
      urls.push(new URL(input));
      return Promise.resolve(new Response(JSON.stringify(body), { status }));
    }),
  );
  return urls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ctx.catalog', () => {
  it('products: параметры как у шлюза, строки без артикулов, всего и номера', async () => {
    const urls = gateway({ products: [ITEM], total: 21, pagination: { page: 2, limit: 20, total: 21, totalPages: 2 } });
    const api = catalog.create(fakeCore().core);
    const found = await api.products({
      page: 2,
      sort: 'price_desc',
      collectionIds: ['c-1', 'c-2'],
      filters: { цвет: ['Синий', 'Белый'] },
      q: ' шарф ',
    });
    expect(urls[0]?.pathname).toBe('/api/store/products');
    expect(urls[0]?.search).toBe(
      `?store_id=${SHOP_ID}&page=2&sort=price_desc&q=%D1%88%D0%B0%D1%80%D1%84&collection_id=c-1&collection_id=c-2&%D1%86%D0%B2%D0%B5%D1%82=%D0%A1%D0%B8%D0%BD%D0%B8%D0%B9&%D1%86%D0%B2%D0%B5%D1%82=%D0%91%D0%B5%D0%BB%D1%8B%D0%B9`,
    );
    expect(found).toEqual({
      ok: true,
      data: {
        items: [
          {
            id: 'p-1',
            title: 'Шарф',
            url: '/product/sharf',
            image: null,
            price: rub(190000),
            compareAtPrice: null,
            available: true,
            hasVariants: false,
          },
        ],
        total: 21,
        page: 2,
        pages: 2,
      },
    });
  });

  it('filters: без страницы, сортировки и коллекций; цена в Money; у магазина без товаров — null', async () => {
    const urls = gateway({
      success: true,
      data: {
        groups: [{ name: 'Цвет', key: 'цвет', values: ['Синий'] }],
        priceRange: { min: 1900, max: 5000 },
        totalProducts: 4,
      },
    });
    const api = catalog.create(fakeCore().core);
    expect(await api.filters({ availability: 'in_stock', minPrice: 100 })).toEqual({
      ok: true,
      data: {
        groups: [{ name: 'Цвет', key: 'цвет', values: ['Синий'] }],
        price: { min: rub(190000), max: rub(500000) },
        total: 4,
      },
    });
    expect(urls[0]?.href).toBe(`${API_URL}/store/filters?store_id=${SHOP_ID}&min_price=100&availability=in_stock`);
    gateway({ success: true, data: { groups: [], priceRange: { min: 0, max: 0 }, totalProducts: 0 } });
    expect(await api.filters()).toMatchObject({ ok: true, data: { price: null, total: 0 } });
  });

  it('ошибка шлюза — его причина; не по форме — server; limit больше 100 — invalid без запроса', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    gateway({ message: 'много' }, 429);
    const api = catalog.create(fakeCore().core);
    expect(await api.products()).toMatchObject({ ok: false, error: { code: 'limit' } });
    gateway({ products: 'x', total: 1 });
    expect(await api.products()).toMatchObject({ ok: false, error: { code: 'server' } });
    const urls = gateway({});
    expect(await api.products({ limit: 101 })).toMatchObject({ ok: false, error: { code: 'invalid' } });
    expect(urls).toHaveLength(0);
    expect(storeQueryOf(SHOP_ID, { q: '  ' }, true).toString()).toBe(`store_id=${SHOP_ID}`);
  });
});

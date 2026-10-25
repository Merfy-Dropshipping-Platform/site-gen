import { afterEach, describe, expect, it, vi } from 'vitest';
import { SEARCH_CACHE_SIZE, search, searchNavigation } from '../src/core/parts/search';
import { productUrl, storeItemOf } from '../src/core/store-items';
import { API_URL, SHOP_ID, fakeCore } from './sdk-support';

// Модуль «Поиск» (блок 11 «Секций и SDK», часть 11б; design.md 11.5): запрос шлюза, кеш, отмена прошлого вызова,
// search.open. Шлюз — заглушка fetch: адрес запроса и ответ. Текст цены — как money сборки: разделитель тысяч
// неразрывный пробел (toLocaleString('ru-RU')).
const rub = (amount: number) => ({ amount, currency: 'RUB', text: `${Math.round(amount / 100).toLocaleString('ru-RU')} ₽` });
const HIT = {
  id: 'p-nova',
  title: 'Шарф «Нова»',
  handle: 'sharf-nova',
  images: ['https://s3.merfy.ru/p/nova.jpg'],
  basePrice: '1900.00',
  compareAtPrice: 2400,
  hasVariants: true,
  quantity: 7,
  allowBackorder: false,
  variantGroups: [],
  variantCombinations: [{ id: 'v-1', price: 1900, compareAtPrice: null, available: false, options: {} }, { id: 'v-2', price: 2300, compareAtPrice: null, available: true, options: {} }],
};

function gateway(answer: (url: URL) => Promise<Response>) {
  const urls: URL[] = [];
  vi.stubGlobal('fetch', vi.fn((input: string) => {
    const url = new URL(input);
    urls.push(url);
    return answer(url);
  }));
  return urls;
}
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('ctx.search.query', () => {
  it('адрес шлюза и строка подсказки: цена в копейках с текстом, старая цена, наличие по сочетаниям, без остатков', async () => {
    const urls = gateway(() => json({ products: [HIT], hasMore: true }));
    const api = search.create(fakeCore().core);
    const found = await api.query('  нова ', { limit: 5 });
    expect(urls.map((url) => url.href)).toEqual([`${API_URL}/store/products/search?store_id=${SHOP_ID}&q=%D0%BD%D0%BE%D0%B2%D0%B0&limit=5`]);
    expect(found).toEqual({
      ok: true,
      data: {
        hasMore: true,
        items: [
          {
            id: 'p-nova',
            title: 'Шарф «Нова»',
            url: '/product/sharf-nova',
            image: 'https://s3.merfy.ru/p/nova.jpg',
            price: rub(190000),
            compareAtPrice: rub(240000),
            available: true,
          },
        ],
      },
    });
  });

  it('пустой запрос — без шлюза; длиннее 500 — invalid; повтор — из кеша; 41-й запрос вытесняет первый', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const urls = gateway(() => json({ products: [], hasMore: false }));
    const api = search.create(fakeCore().core);
    expect(await api.query('   ')).toEqual({ ok: true, data: { items: [], hasMore: false } });
    expect(await api.query('а'.repeat(501))).toMatchObject({ ok: false, error: { code: 'invalid' } });
    expect(urls).toHaveLength(0);
    await api.query('шарф');
    await api.query('шарф');
    expect(urls).toHaveLength(1);
    for (let n = 0; n < SEARCH_CACHE_SIZE; n += 1) await api.query(`q${n}`);
    await api.query('шарф');
    expect(urls).toHaveLength(SEARCH_CACHE_SIZE + 2);
  });

  it('новый вызов — ответа на старый нет, ответ нового приходит; ответ старого всё равно в кеше', async () => {
    const slow = { open: (): void => undefined };
    const urls = gateway((url) =>
      url.searchParams.get('q') === 'ш'
        ? new Promise<Response>((resolve) => {
            slow.open = () => resolve(new Response(JSON.stringify({ products: [HIT], hasMore: false })));
          })
        : json({ products: [], hasMore: false }),
    );
    const api = search.create(fakeCore().core);
    let oldArrived = false;
    void api.query('ш').then(() => {
      oldArrived = true;
    });
    const fresh = await api.query('шарф');
    slow.open();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect([fresh.ok, oldArrived]).toEqual([true, false]);
    expect((await api.query('ш')).ok).toBe(true);
    expect(urls).toHaveLength(2);
  });

  it('ответ не по форме — server с уведомлением; обрыв — network; quiet — без уведомления', async () => {
    gateway(() => json({ items: [] }));
    const fake = fakeCore();
    const api = search.create(fake.core);
    expect(await api.query('x')).toMatchObject({ ok: false, error: { code: 'server' } });
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    expect(await api.query('y', { quiet: true })).toMatchObject({ ok: false, error: { code: 'network' } });
    expect(fake.named('merfy:notice:show')).toHaveLength(1);
  });
});

describe('search.open', () => {
  it('панель на странице — merfy:search:open; нет — переход на /catalog, в превью — без перехода', async () => {
    const assign = vi.spyOn(searchNavigation, 'go').mockImplementation(() => undefined);
    const fake = fakeCore();
    const api = search.create(fake.core);
    expect(await api.open()).toEqual({ ok: true, data: { panel: false } });
    expect(assign).toHaveBeenCalledWith('/catalog');
    document.body.innerHTML = '<merfy-section data-section="shop:search" data-section-id="s-1"><div data-behavior="search"></div></merfy-section>';
    expect(await api.open()).toEqual({ ok: true, data: { panel: true } });
    expect(fake.named('merfy:search:open')).toEqual([{}]);
    document.body.replaceChildren();
    await search.create(fakeCore('preview').core).open();
    expect(assign).toHaveBeenCalledTimes(1);
    expect(search.markup?.open?.params).toEqual([]);
  });
});

describe('строка товара шлюза', () => {
  it('адрес — handle или id; цены нет — 0 ₽; старая не больше цены — null; не по форме — null', () => {
    expect(productUrl('sharf-nova', 'p-1')).toBe('/product/sharf-nova');
    expect(productUrl('шарф нова', 'p-1')).toBe('/product/p-1');
    const plain = storeItemOf({ id: 'p-2', title: 'Плед', handle: 'pled', basePrice: null, compareAtPrice: 0, quantity: 0, allowBackorder: true }, 'RUB');
    expect(plain).toMatchObject({ price: { amount: 0 }, compareAtPrice: null, available: true, image: null, hasVariants: false });
    expect(storeItemOf({ title: 'без id' }, 'RUB')).toBeNull();
  });
});

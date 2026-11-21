import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogItemOf } from '../src/core/catalog-items';
import { filtersListOf } from '../src/core/catalog-filters';
import { catalog, storeQueryOf } from '../src/core/parts/catalog';
import { SHOP_ID, fakeCore } from './sdk-support';

// Динамичные фильтры каталога (часть 1): параметры запроса, поля карточки, список filters. Секция рисует его по type и
// kind, о конкретных группах не знает — незнакомые kind и поля SDK отдаёт как есть.
const rub = (amount: number) => ({
  amount,
  currency: 'RUB',
  text: `${Math.round(amount / 100).toLocaleString('ru-RU')} ₽`,
});
const BASE = {
  id: 'p-1',
  title: 'Шарф',
  handle: 'sharf',
  images: [],
  basePrice: 1900,
  hasVariants: false,
  quantity: 3,
};

const gateway = (body: unknown, status = 200) => {
  const urls: URL[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) => {
      urls.push(new URL(input));
      return Promise.resolve(new Response(JSON.stringify(body), { status }));
    }),
  );
  return urls;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('catalog: параметры запроса', () => {
  it('теги, признаки, коллекции — повтором ключа; числа — одним параметром', () => {
    const params = storeQueryOf(
      SHOP_ID,
      {
        tags: ['лето', 'хит'],
        badges: ['sale', 'low_stock'],
        minDiscount: 20,
        newDays: 14,
        lowStockMax: 3,
        collectionIds: ['c-1'],
      },
      false,
    );
    expect(params.getAll('tags')).toEqual(['лето', 'хит']);
    expect(params.getAll('badge')).toEqual(['sale', 'low_stock']);
    expect(params.getAll('collection_id')).toEqual(['c-1']);
    expect(params.get('min_discount')).toBe('20');
    expect(params.get('new_days')).toBe('14');
    expect(params.get('low_stock_max')).toBe('3');
  });

  it('filters отдаёт шлюзу и коллекции, и новые параметры; страницу и сортировку — нет', async () => {
    const urls = gateway({ success: true, data: { groups: [], priceRange: { min: 0, max: 0 }, totalProducts: 0 } });
    const api = catalog.create(fakeCore().core);
    await api.filters({ collectionIds: ['c-1', 'c-2'], badges: ['new'], tags: ['a'] });
    expect(urls[0]?.search).toBe(`?store_id=${SHOP_ID}&collection_id=c-1&collection_id=c-2&tags=a&badge=new`);
  });

  it.each<[string, Record<string, unknown>]>([
    ['minDiscount 0', { minDiscount: 0 }],
    ['minDiscount 100', { minDiscount: 100 }],
    ['minDiscount дробное', { minDiscount: 1.5 }],
    ['newDays 366', { newDays: 366 }],
    ['lowStockMax 0', { lowStockMax: 0 }],
    ['lowStockMax 1001', { lowStockMax: 1001 }],
    ['незнакомый признак', { badges: ['hit'] }],
    ['пустой тег', { tags: ['  '] }],
  ])('неверное значение (%s) — invalid без запроса, и у products, и у filters', async (_name, query) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const urls = gateway({});
    const api = catalog.create(fakeCore().core);
    expect(await api.products(query)).toMatchObject({ ok: false, error: { code: 'invalid' } });
    expect(await api.filters(query)).toMatchObject({ ok: false, error: { code: 'invalid' } });
    expect(urls).toHaveLength(0);
  });

  it('границы допустимы: 1 и 99, 1 и 365, 1 и 1000', async () => {
    const urls = gateway({ success: true, data: { groups: [], priceRange: { min: 0, max: 0 }, totalProducts: 0 } });
    const api = catalog.create(fakeCore().core);
    await api.filters({ minDiscount: 99, newDays: 365, lowStockMax: 1000 });
    await api.filters({ minDiscount: 1, newDays: 1, lowStockMax: 1 });
    expect(urls).toHaveLength(2);
  });
});

describe('catalog: поля карточки', () => {
  it('признаки, скидка, остаток и теги — как в ответе товара', () => {
    const item = catalogItemOf(
      { ...BASE, badges: ['sale', 'low_stock'], discountPercent: 25, stockLeft: 3, tags: ['лето', 'хит'] },
      'RUB',
    );
    expect(item).toMatchObject({
      price: rub(190000),
      badges: ['sale', 'low_stock'],
      discountPercent: 25,
      stockLeft: 3,
      tags: ['лето', 'хит'],
    });
  });

  it('нет полей или не той формы — пустой список и null, карточка остаётся', () => {
    expect(catalogItemOf(BASE, 'RUB')).toMatchObject({ badges: [], discountPercent: null, stockLeft: null, tags: [] });
    const odd = catalogItemOf(
      { ...BASE, badges: 'sale', discountPercent: '25', stockLeft: -1, tags: ['a', 1, '', null] },
      'RUB',
    );
    expect(odd).toMatchObject({ id: 'p-1', badges: [], discountPercent: null, stockLeft: null, tags: ['a'] });
    expect(catalogItemOf({ ...BASE, discountPercent: 0, stockLeft: 0 }, 'RUB')).toMatchObject({
      discountPercent: null,
      stockLeft: 0,
    });
  });

  it('не товар — null', () => {
    expect(catalogItemOf({ title: 'без id' }, 'RUB')).toBeNull();
    expect(catalogItemOf(null, 'RUB')).toBeNull();
  });
});

const PRICE = {
  key: 'price',
  kind: 'price',
  type: 'range',
  label: 'Цена',
  params: { min: 'min_price', max: 'max_price' },
  min: 1900,
  max: 5000,
};
const BADGE = {
  key: 'badge',
  kind: 'badge',
  type: 'flags',
  label: 'Подборки',
  param: 'badge',
  options: [{ value: 'sale', label: 'Со скидкой', count: 4, selected: true }],
};

describe('catalog: список filters', () => {
  it('цена — деньги; list и flags — как есть, с типом и параметром', () => {
    const list = filtersListOf([PRICE, BADGE], 'RUB');
    expect(list[0]).toMatchObject({ kind: 'price', type: 'range', min: rub(190000), max: rub(500000) });
    expect(list[0]).toHaveProperty('params', { min: 'min_price', max: 'max_price' });
    expect(list[1]).toEqual(BADGE);
  });

  it('незнакомый kind с понятной формой отдаётся, незнакомые поля фильтра и опций — тоже', () => {
    const country = {
      key: 'country',
      kind: 'attribute',
      type: 'list',
      label: 'Страна',
      param: 'country',
      hint: 'любое',
      options: [{ value: 'ru', label: 'Россия', count: 2, selected: false, swatch: { hex: '#fff', image: null } }],
    };
    const weight = { key: 'weight', kind: 'attribute', type: 'range', label: 'Вес', min: 1, max: 9, histogram: [1, 2] };
    expect(filtersListOf([country, weight], 'RUB')).toEqual([country, weight]);
  });

  it('не по форме — без этого фильтра, остальные остаются', () => {
    const bad = [
      null,
      'x',
      { ...BADGE, type: 'constructor' },
      { ...BADGE, type: 'carousel' },
      { ...BADGE, key: '' },
      { ...BADGE, label: 5 },
      { ...BADGE, param: undefined },
      { ...BADGE, options: 'нет' },
      { ...PRICE, min: 'x' },
      { ...PRICE, max: null },
    ];
    expect(filtersListOf([...bad, BADGE], 'RUB')).toEqual([BADGE]);
  });

  it('опции: без value, label или count — выкидываются; selected не булево — false; kind нет — по ключу', () => {
    const odd = {
      key: 'tags',
      type: 'list',
      label: 'Теги',
      param: 'tags',
      options: [
        { value: 'a', label: 'А', count: 1, selected: 'yes' },
        { value: 'b', label: 'Б' },
        { label: 'В', count: 1 },
        { value: 'd', label: 'Г', count: -1 },
        7,
      ],
    };
    expect(filtersListOf([odd], 'RUB')).toEqual([
      { ...odd, kind: 'tags', options: [{ value: 'a', label: 'А', count: 1, selected: false }] },
    ]);
  });

  it('нет поля или не список (старый шлюз) — пустой список', () => {
    expect(filtersListOf(undefined, 'RUB')).toEqual([]);
    expect(filtersListOf({}, 'RUB')).toEqual([]);
  });

  it('ответ /store/filters: filters рядом со старыми groups, price и total', async () => {
    gateway({
      success: true,
      data: {
        groups: [{ name: 'Цвет', key: 'цвет', values: ['Синий'] }],
        priceRange: { min: 1900, max: 5000 },
        totalProducts: 4,
        filters: [PRICE, BADGE],
      },
    });
    const api = catalog.create(fakeCore().core);
    expect(await api.filters()).toMatchObject({
      ok: true,
      data: {
        total: 4,
        price: { min: rub(190000), max: rub(500000) },
        filters: [{ kind: 'price' }, { kind: 'badge' }],
      },
    });
  });
});

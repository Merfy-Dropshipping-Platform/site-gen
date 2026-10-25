import {
  EMPTY_LIST_QUERY,
  money,
  parseBuildInputs,
  sha256,
  type ListSource,
  type ShopTheme,
} from '@merfy/storefront-build';
import { parseTheme } from '@merfy/tokens';
import { describe, expect, it } from 'vitest';
import standInputsJson from '../../storefront-build/fixtures/stand-inputs.json';
import novaThemeJson from '../../theme-nova/theme.json';
import { PRODUCTS_FILTERS, PRODUCTS_FIND, listAt, listRequestOf } from '../src/list-rpc';
import { PRODUCT_QUEUE, type ProductRequest } from '../src/snapshot';

// Список с параметрами у сервиса product (блок 11 «Секций и SDK», часть 11а-2): аргументы — как у шлюза, ответ — id
// товаров страницы, всего и значения фильтров.
const SHOP = '00000000-0000-4000-8000-000000000001';
const C1 = '00000000-0000-4000-8000-000000000201';
const CATALOG: ListSource = {
  kind: 'products',
  url: '/catalog',
  pages: 'built',
  collectionId: null,
  catalog: true,
  perPage: 2,
};
const FOUND = {
  success: true,
  message: 'ok',
  data: [{ id: 'p-3', title: 'Плед', costPrice: 100 }, { id: 'p-1' }],
  total: 5,
};
const FILTERS = {
  success: true,
  data: {
    groups: [{ name: 'Цвет', key: 'цвет', values: ['Белый', 'Синий'] }],
    priceRange: { min: 1900, max: 5000.5 },
    totalProducts: 5,
  },
};
const NO_FILTERS = { success: true, data: { groups: [], priceRange: { min: 0, max: 0 }, totalProducts: 0 } };
const INPUTS = parseBuildInputs(standInputsJson);
const THEME: ShopTheme = { tokens: parseTheme(novaThemeJson.tokens), render: () => Promise.resolve('<html></html>') };

function probe(answers: Readonly<Record<string, () => Promise<unknown>>>) {
  const calls: unknown[][] = [];
  const lines: string[] = [];
  const request: ProductRequest = {
    call: (...args) => {
      calls.push(args);
      const answer = answers[String(args[1])];
      return answer === undefined ? Promise.reject(new Error('нет ответа')) : answer();
    },
    timeoutMs: 1_000,
    log: (message, fields) => {
      lines.push(`${message} ${JSON.stringify(fields)}`);
    },
  };
  return { request, calls, lines };
}
const ok = (value: unknown) => () => Promise.resolve(value);

describe('product.findAll и product.getFilters', () => {
  it('аргументы как у шлюза; ответ — id по порядку, всего, цена в Money и выбранные значения', async () => {
    const { request, calls } = probe({ [PRODUCTS_FIND]: ok(FOUND), [PRODUCTS_FILTERS]: ok(FILTERS) });
    const found = await listRequestOf(request, SHOP, INPUTS, CATALOG, 'sort=price_asc&filter.цвет=Синий&page=2');
    expect(found.listed).toEqual({
      ids: ['p-3', 'p-1'],
      total: 5,
      facets: {
        price: { min: money(190000), max: money(500050) },
        groups: [
          {
            key: 'цвет',
            name: 'Цвет',
            values: [
              { value: 'Белый', selected: false },
              { value: 'Синий', selected: true },
            ],
          },
        ],
      },
    });
    expect(calls).toEqual([
      [
        PRODUCT_QUEUE,
        PRODUCTS_FIND,
        { shopId: SHOP, skip: 2, take: 2, status: 'active', sort: 'price_asc', variantFilters: { цвет: 'Синий' } },
        1_000,
      ],
      [PRODUCT_QUEUE, PRODUCTS_FILTERS, { shopId: SHOP, variantFilters: { цвет: 'Синий' } }, 1_000],
    ]);
  });

  it('коллекция страницы — collectionId; товаров нет — цена null', async () => {
    const { request, calls } = probe({
      [PRODUCTS_FIND]: ok({ success: true, data: [], total: 0 }),
      [PRODUCTS_FILTERS]: ok(NO_FILTERS),
    });
    const source: ListSource = { ...CATALOG, catalog: false, collectionId: C1 };
    const found = await listRequestOf(request, SHOP, INPUTS, source, 'availability=in_stock&collection=chuzhaya');
    expect(found.listed).toEqual({ ids: [], total: 0, facets: { price: null, groups: [] } });
    expect(calls[0]?.[2]).toEqual({
      shopId: SHOP,
      skip: 0,
      take: 2,
      status: 'active',
      collectionId: C1,
      availability: 'in_stock',
    });
  });

  it('каталог: выбраны только неизвестные коллекции — пустой список без findAll', async () => {
    const { request, calls } = probe({ [PRODUCTS_FILTERS]: ok(FILTERS) });
    const found = await listRequestOf(request, SHOP, INPUTS, CATALOG, 'collection=net-takoy');
    expect(found.listed).toMatchObject({ ids: [], total: 0 });
    expect(calls.map((call) => call[1])).toEqual([PRODUCTS_FILTERS]);
  });

  it('неуспех, ответ не по форме или тишина — rpc-failed и строка журнала list-failed', async () => {
    const answers = [
      ok({ success: false }),
      ok({ success: true, data: 'x', total: 1 }),
      () => Promise.reject(new Error('тишина')),
    ];
    for (const answer of answers) {
      const { request, lines } = probe({ [PRODUCTS_FIND]: answer, [PRODUCTS_FILTERS]: ok(FILTERS) });
      await expect(listRequestOf(request, SHOP, INPUTS, CATALOG, 'q=x')).rejects.toMatchObject({ code: 'rpc-failed' });
      expect(lines[0]).toMatch(/^list-failed /);
    }
  });
});

describe('когда сервис product не нужен', () => {
  it('без параметров, только номер, без клиента product, у статей — без запроса, listed null', async () => {
    const { request, calls } = probe({});
    expect(await listRequestOf(request, SHOP, INPUTS, CATALOG, '')).toEqual({ query: EMPTY_LIST_QUERY, listed: null });
    expect(await listRequestOf(request, SHOP, INPUTS, CATALOG, 'page=3')).toEqual({
      query: { ...EMPTY_LIST_QUERY, page: 3 },
      listed: null,
    });
    expect((await listRequestOf(undefined, SHOP, INPUTS, CATALOG, 'q=x')).listed).toBeNull();
    const blog: ListSource = { kind: 'articles', url: '/blogs/novosti', pages: 'built', blogId: 'b-1', perPage: 12 };
    expect((await listRequestOf(request, SHOP, INPUTS, blog, 'q=x')).listed).toBeNull();
    expect(calls).toEqual([]);
  });

  it('по адресу: у страницы без списка — undefined; каталога нет — page-unknown; каталог — источник каталога', async () => {
    const { request, calls } = probe({ [PRODUCTS_FIND]: ok(FOUND), [PRODUCTS_FILTERS]: ok(FILTERS) });
    expect(await listAt(request, SHOP, INPUTS, '/', THEME, 'page=2')).toBeUndefined();
    await expect(listAt(request, SHOP, INPUTS, '/catalog', THEME, 'q=x')).rejects.toMatchObject({
      code: 'page-unknown',
    });
    const withCatalog = parseBuildInputs({
      ...standInputsJson,
      code: {
        sections: [
          { name: 'shop:grid', kind: 'section', hash: sha256('правка'), render: sha256('модуль'), script: null },
        ],
        pages: { catalog: [{ id: 'grid-1', section: 'shop:grid', settings: { 'per-page': 4 } }] },
        globals: [],
      },
    });
    expect((await listAt(request, SHOP, withCatalog, '/catalog', THEME, 'q=x'))?.listed?.total).toBe(5);
    expect(calls[0]?.[2]).toMatchObject({ take: 4, search: 'x' });
  });
});

import { describe, expect, it } from 'vitest';
import canonicalCases from '../fixtures/list-canonical.json';
import {
  EMPTY_LIST_QUERY,
  LIST_FILTER_PREFIX,
  LIST_PARAM_NAMES,
  LIST_Q_MAX,
  filtersRpcArgs,
  listQueryIsEmpty,
  listQueryString,
  parseListQuery,
  productsRpcArgs,
} from '../src/list-query';

// Параметры списка (блок 11 «Секций и SDK», часть 11а, design.md 11.4): адрес → выбранное, канонический вид — ключ кеша
// раздачи, аргументы RPC — те же, что строит шлюз (store.controller.ts).
const SHOP = '00000000-0000-4000-8000-000000000001';
const parse = (text: string) => parseListQuery(new URLSearchParams(text));

describe('разбор параметров списка', () => {
  it('известные параметры; повтор collection и filter.<группа> — несколько значений', () => {
    expect(
      parse(
        'sort=price_desc&min_price=500&max_price=3000&availability=in_stock&collection=kashemir&collection=len' +
          '&filter.cvet=Синий&filter.cvet=Красный&q=%D0%BD%D0%BE%D0%B2%D0%B0&page=2',
      ),
    ).toEqual({
      sort: 'price_desc',
      minPrice: 500,
      maxPrice: 3000,
      availability: 'in_stock',
      collections: ['kashemir', 'len'],
      filters: { cvet: ['Синий', 'Красный'] },
      q: 'нова',
      page: 2,
      tags: [],
      badges: [],
      minDiscount: null,
      newDays: null,
      lowStockMax: null,
    });
  });

  it('теги, признаки и их пороги: повторы — несколько значений, чужие признаки и вне пределов — отброшены', () => {
    expect(
      parse('tag=leto&tag=hlopok&tag=leto&badge=sale&badge=hit&badge=new&min_discount=20&new_days=14&low_stock_max=3'),
    ).toMatchObject({
      tags: ['leto', 'hlopok'],
      badges: ['sale', 'new'],
      minDiscount: 20,
      newDays: 14,
      lowStockMax: 3,
    });
    expect(parse('min_discount=0&new_days=366&low_stock_max=1.5&tag=%20&badge=')).toEqual(EMPTY_LIST_QUERY);
    expect(parse('min_discount=99&new_days=1&low_stock_max=1000')).toMatchObject({
      minDiscount: 99,
      newDays: 1,
      lowStockMax: 1000,
    });
    expect(parse('min_discount=100&min_discount=').minDiscount).toBeNull();
  });

  it('чужие параметры и то, чего шлюз не принимает, — отброшены', () => {
    expect(
      parse('utm_source=vk&yclid=1&sort=cheap&availability=all&min_price=-1&max_price=abc&page=0&filter.=x'),
    ).toEqual(EMPTY_LIST_QUERY);
    expect(parse('sort=newest&sort=price_asc').sort).toBe('price_asc');
    expect(parse('sort=title_asc').sort).toBeNull();
    expect(parse('q=%20%20').q).toBeNull();
    expect(parse(`q=${'а'.repeat(LIST_Q_MAX + 1)}`).q).toBeNull();
    expect(parse('collection=a&collection=a&filter.cvet=x&filter.cvet=x')).toMatchObject({
      collections: ['a'],
      filters: { cvet: ['x'] },
    });
  });

  it('канонический вид: имена по алфавиту, значения по порядку, page=1 не пишется; пусто — пустая строка', () => {
    const query = parse('q=шарф&sort=price_asc&page=1&filter.cvet=b&filter.cvet=a&collection=z');
    expect(listQueryString(query)).toBe(
      'collection=z&filter.cvet=b&filter.cvet=a&q=%D1%88%D0%B0%D1%80%D1%84&sort=price_asc',
    );
    expect(listQueryString({ ...query, page: 3 })).toContain('&page=3&');
    expect(listQueryString(EMPTY_LIST_QUERY)).toBe('');
    expect(listQueryIsEmpty(parse('page=4'))).toBe(true);
    expect(listQueryIsEmpty(parse('q=x'))).toBe(false);
    expect(listQueryIsEmpty(parse('badge=sale'))).toBe(false);
    expect(listQueryIsEmpty(parse('new_days=7'))).toBe(false);
  });
});

// Ключ кеша рендера по запросу: раздача (nginx-minio-proxy, storefront/njs/route.js, listArgs) и сборка обязаны
// давать одну строку. Тот же файл случаев лежит в раздаче и сверяет её listArgs и LIST_NAMES.
describe('канонический вид — как у раздачи (fixtures/list-canonical.json)', () => {
  const namesOf = (canonical: string): string[] =>
    [...new Set(canonical.split('&').map((pair) => decodeURIComponent(pair.split('=')[0] ?? '')))].sort();

  it('имена параметров — те же, что LIST_NAMES раздачи', () => {
    expect([...LIST_PARAM_NAMES]).toEqual(canonicalCases.names);
    expect(LIST_FILTER_PREFIX).toBe(canonicalCases.filterPrefix);
  });

  it('каждое имя LIST_PARAM_NAMES пишется в канонический вид, и ничего сверх них и filter.', () => {
    const full = parse(
      'sort=newest&min_price=1&max_price=2&availability=in_stock&collection=a&filter.cvet=x&q=y&page=2' +
        '&tag=t&badge=sale&min_discount=10&new_days=7&low_stock_max=3',
    );
    const names = namesOf(listQueryString(full)).filter((name) => !name.startsWith(LIST_FILTER_PREFIX));
    expect(names).toEqual([...LIST_PARAM_NAMES]);
  });

  it.each(canonicalCases.cases)('$args', ({ args, canonical }) => {
    expect(listQueryString(parse(args))).toBe(canonical);
  });
});

describe('аргументы RPC — как у шлюза', () => {
  it('product.findAll: страница, размер, newest → popular, цены местами, поиск с полями, группы', () => {
    const query = parse('sort=newest&min_price=3000&max_price=500&q=нова&filter.cvet=Синий&filter.cvet=Красный&page=3');
    expect(productsRpcArgs(SHOP, query, ['c-1'], 8)).toEqual({
      shopId: SHOP,
      skip: 16,
      take: 8,
      status: 'active',
      collectionId: 'c-1',
      sort: 'popular',
      minPrice: 500,
      maxPrice: 3000,
      search: 'нова',
      searchFields: ['title', 'sku'],
      variantFilters: { cvet: ['Синий', 'Красный'] },
    });
  });

  it('сортировки списка — имена сервиса product: popular → quantity_desc (по остатку), newest → popular', () => {
    const sortOf = (list: string): unknown => productsRpcArgs(SHOP, parse(list), [], 8).sort;
    expect([
      sortOf('sort=popular'),
      sortOf('sort=newest'),
      sortOf('sort=price_desc'),
      sortOf('sort=price_asc'),
      sortOf(''),
    ]).toEqual(['quantity_desc', 'popular', 'price_desc', 'price_asc', undefined]);
  });

  it('product.findAll без фильтров: только магазин, страница и статус; несколько коллекций — массивом', () => {
    expect(productsRpcArgs(SHOP, EMPTY_LIST_QUERY, [], 24)).toEqual({
      shopId: SHOP,
      skip: 0,
      take: 24,
      status: 'active',
    });
    expect(productsRpcArgs(SHOP, parse('availability=sold_out&filter.razmer=M'), ['c-1', 'c-2'], 2)).toMatchObject({
      collectionId: ['c-1', 'c-2'],
      availability: 'sold_out',
      variantFilters: { razmer: 'M' },
    });
  });

  it('теги, признаки и пороги — в обоих RPC по контракту (массивы, числа); коллекции — и в getFilters', () => {
    const query = parse('tag=leto&badge=sale&badge=low_stock&min_discount=20&new_days=14&low_stock_max=3');
    const shared = {
      tags: ['leto'],
      badges: ['sale', 'low_stock'],
      minDiscount: 20,
      newDays: 14,
      lowStockMax: 3,
    };
    expect(productsRpcArgs(SHOP, query, ['c-1'], 8)).toMatchObject({ ...shared, collectionId: 'c-1' });
    expect(filtersRpcArgs(SHOP, query, ['c-1', 'c-2'])).toEqual({
      shopId: SHOP,
      ...shared,
      collectionId: ['c-1', 'c-2'],
    });
    expect(filtersRpcArgs(SHOP, parse('badge=new'))).toEqual({ shopId: SHOP, badges: ['new'] });
  });

  it('product.getFilters: без страницы и сортировки; коллекции не переданы — без collectionId', () => {
    expect(
      filtersRpcArgs(SHOP, parse('sort=price_asc&min_price=100&q=шарф&collection=a&filter.cvet=Синий&page=2')),
    ).toEqual({
      shopId: SHOP,
      minPrice: 100,
      search: 'шарф',
      searchFields: ['title', 'sku'],
      variantFilters: { cvet: 'Синий' },
    });
    expect(filtersRpcArgs(SHOP, EMPTY_LIST_QUERY)).toEqual({ shopId: SHOP });
  });
});

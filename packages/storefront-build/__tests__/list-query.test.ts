import { describe, expect, it } from 'vitest';
import {
  EMPTY_LIST_QUERY,
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
    });
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

  it('product.getFilters: без страницы, сортировки и коллекций', () => {
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

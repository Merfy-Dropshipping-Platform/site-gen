import { describe, expect, it } from 'vitest';
import { pagePropsOf, type ShopTheme } from '../src/page';
import type { CodeInstance } from '../src/inputs';
import {
  CATALOG_PAGE_ID,
  CATALOG_PATH,
  catalogShown,
  catalogUrlOf,
  pageInfoById,
  routeOf,
  shopRoutes,
} from '../src/routes';
import { EMPTY_SHOP, shopPropsOf } from '../src/shop-props';
import { errorOf } from './support';
import { P1, placed, product, recordInputs } from './support-records';
import { fakeRender, novaTokens } from './support-theme';

// Каталог — особая страница catalog (блок 11 «Секций и SDK», часть 11а, Р11а-1, Р11а-2): /catalog есть, когда в его
// списке есть видимый экземпляр; в превью — всегда; shop.catalogUrl — адрес или null.
const theme: ShopTheme = { tokens: novaTokens, render: fakeRender };

describe('особая страница catalog', () => {
  it('видимая секция в списке catalog — страница /catalog: файл, сайт, первая страница списка', () => {
    const inputs = recordInputs([product(P1)], { catalog: [placed('catalog-1')] });
    const route = shopRoutes(inputs).find((candidate) => candidate.id === CATALOG_PAGE_ID);
    expect(route).toMatchObject({ id: 'catalog', path: '/catalog', file: 'catalog/index.html', entity: 'site' });
    expect(route?.list).toEqual({ page: 1 });
    expect(route?.aliases).toEqual(['/catalog/page/1']);
    expect(catalogShown(inputs)).toBe(true);
    expect(catalogUrlOf(inputs)).toBe(CATALOG_PATH);
  });

  it('список пуст или только скрытые — страницы нет: 404, catalogUrl — null', () => {
    const CASES: Record<string, CodeInstance[]>[] = [{}, { catalog: [placed('catalog-1', true)] }];
    for (const pages of CASES) {
      const inputs = recordInputs([product(P1)], pages);
      expect(shopRoutes(inputs).map((route) => route.path)).not.toContain('/catalog');
      expect(errorOf(() => routeOf('/catalog', inputs))).toMatchObject({ code: 'page-unknown' });
      expect(catalogUrlOf(inputs)).toBeNull();
    }
  });

  it('превью: каталог есть и с пустым списком; блок на странице catalog получает её id и адрес', () => {
    const inputs = recordInputs([product(P1)], {});
    expect(routeOf('/catalog', inputs, 'preview').id).toBe('catalog');
    expect(pageInfoById(inputs, 'catalog')).toMatchObject({ id: 'catalog', path: '/catalog' });
  });

  it('shop.catalogUrl — у данных магазина страницы; по умолчанию null', () => {
    const shown = recordInputs([product(P1)], { catalog: [placed('catalog-1')] });
    expect(pagePropsOf(shown, theme).shop.catalogUrl).toBe('/catalog');
    expect(pagePropsOf(recordInputs([product(P1)], {}), theme).shop.catalogUrl).toBeNull();
    expect(EMPTY_SHOP.catalogUrl).toBeNull();
    expect(shopPropsOf('Шарфы', []).catalogUrl).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { EMPTY_LIST_QUERY, parseListQuery } from '../src/list-query';
import { checkPageRow } from '../src/manifest';
import { listSourceAt, renderShopPage, type ShopTheme } from '../src/page';
import { defaultVariantId, pageListOf, type ListSource, type PageList } from '../src/page-list';
import { money, type ProductRecord } from '../src/records';
import { recordIndex, routeOf, shopRoutes } from '../src/routes';
import type { SectionRenderRequest } from '../src/sections-render';
import { errorOf } from './support';
import {
  B1,
  C1,
  ID,
  RECORD_SECTION,
  article,
  blog,
  collection,
  product,
  recordInputs,
  recordPage,
} from './support-records';
import { fakeRender, novaTokens } from './support-theme';

// Страницы списка (блок 11 «Секций и SDK», часть 11а, design.md 11.1, 11.2): каталог, коллекции и блоги, страницы N,
// page.list у секций, строка манифеста и SEO.
const theme: ShopTheme = { tokens: novaTokens, render: fakeRender };
const PRODUCTS = [1, 2, 3, 4, 5].map((n) =>
  product(ID(100 + n), {
    title: `Шарф ${n}`,
    handle: `sharf-${n}`,
    price: 100000 * n,
    images: [`https://s3.merfy.ru/p/${n}.jpg`],
  }),
);
const KASHEMIR = collection(C1, { productIds: [ID(105), ID(101), ID(103)] });
const ARTICLES = [1, 2, 3].map((n) =>
  article(ID(400 + n), { title: `Запись ${n}`, slug: `zapis-${n}`, publishedAt: `2026-10-1${n}T10:00:00.000Z` }),
);
const list = (perPage: number) => [{ id: 'list-1', section: RECORD_SECTION, settings: { 'per-page': perPage } }];
const inputsOf = (perPage = 2) =>
  recordInputs([...PRODUCTS, KASHEMIR, blog(B1), ...ARTICLES], {
    catalog: list(perPage),
    collection: list(perPage),
    blog: list(perPage),
    // Шаблон статьи с секциями — иначе по правилу 8б (templateShown) страниц статей нет и тест «страница без списка»
    // не откроет /blogs/novosti/zapis-1 (поправка 25.10, 09:50).
    article: list(perPage),
  });

async function listAt(path: string, inputs = inputsOf()): Promise<PageList | undefined> {
  const requests: SectionRenderRequest[] = [];
  await renderShopPage(inputs, path, theme, recordPage(requests));
  return requests[0]?.page?.list;
}

describe('страницы N в сборке', () => {
  it('каталог 5 товаров по 2 — три страницы; коллекция 3 по 2 — две; блог 3 по 2 — две', () => {
    const paths = shopRoutes(inputsOf()).map((route) => route.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        '/catalog',
        '/catalog/page/2',
        '/catalog/page/3',
        '/collections/kashemir/page/2',
        '/blogs/novosti/page/2',
      ]),
    );
    expect(paths).not.toContain('/catalog/page/4');
    expect(paths).not.toContain('/catalog/page/1');
    const second = routeOf('/collections/kashemir/page/2', inputsOf());
    expect(second).toMatchObject({
      id: 'collection',
      file: 'collections/kashemir/page/2/index.html',
      entity: 'collection',
    });
    expect(second.list).toEqual({ page: 2 });
    expect(second.record?.id).toBe(C1);
  });

  it('/catalog/page/1 — второй адрес первой страницы; /catalog/page/4 — нет страницы', async () => {
    const page = await renderShopPage(inputsOf(), '/catalog', theme, recordPage());
    expect(page.row.aliases).toEqual(['/catalog/page/1']);
    expect(page.row.list).toEqual({ page: 1 });
    expect(errorOf(() => routeOf('/catalog/page/4', inputsOf()))).toMatchObject({ code: 'page-unknown' });
  });

  // Саботаж Б11а-3 (страниц 0 без max(1, …) и aliases …/page/1 записи): карточные тесты это не проверяют.
  it('пустой список — одна страница; вторые адреса первой страницы — …/page/1', async () => {
    const empty = recordInputs([KASHEMIR, blog(B1)], { catalog: list(2), collection: list(2) });
    const found = await listAt('/catalog', empty);
    expect([found?.total, found?.pages, found?.links]).toEqual([0, 1, [{ page: 1, url: '/catalog', current: true }]]);
    const kashemir = await renderShopPage(empty, '/collections/kashemir', theme, recordPage());
    expect(kashemir.row.aliases).toEqual([`/collections/${C1}`, '/collections/kashemir/page/1']);
  });

  it('без per-page — 24 товара на странице: страниц N нет', () => {
    const inputs = recordInputs(PRODUCTS, { catalog: [{ id: 'c-1', section: RECORD_SECTION, settings: {} }] });
    expect(shopRoutes(inputs).filter((route) => route.path.startsWith('/catalog/page/'))).toEqual([]);
  });
});

describe('page.list у секций', () => {
  it('каталог, страница 2: карточки, номера, соседние страницы, сортировки', async () => {
    const found = await listAt('/catalog/page/2');
    expect(found).toMatchObject({ kind: 'products', total: 5, page: 2, pages: 3, perPage: 2, url: '/catalog' });
    expect(found?.items.map((item) => item.title)).toEqual(['Шарф 3', 'Шарф 4']);
    expect([found?.prev, found?.next]).toEqual(['/catalog', '/catalog/page/3']);
    expect(found?.links).toEqual([
      { page: 1, url: '/catalog', current: false },
      { page: 2, url: '/catalog/page/2', current: true },
      { page: 3, url: '/catalog/page/3', current: false },
    ]);
    expect(found?.sorts.find((sort) => sort.selected)?.value).toBe('newest');
    expect(found?.query).toEqual({ ...EMPTY_LIST_QUERY, page: 2 });
  });

  it('карточка: первые два фото, сочетание по умолчанию, признак вариантов', async () => {
    const found = await listAt('/catalog');
    expect(found?.items[0]).toMatchObject({
      id: ID(101),
      url: '/product/sharf-1',
      images: ['https://s3.merfy.ru/p/1.jpg'],
      variantId: null,
      hasVariants: false,
    });
  });

  it('коллекция — порядок мерчанта; блог — новые сверху; у статей нет фильтров и сортировок', async () => {
    const kashemir = await listAt('/collections/kashemir');
    expect(kashemir?.items.map((item) => item.id)).toEqual([ID(105), ID(101)]);
    expect(kashemir?.sorts.some((sort) => sort.selected)).toBe(false);
    expect(kashemir?.facets?.collections).toEqual([]);
    const news = await listAt('/blogs/novosti');
    expect(news).toMatchObject({ kind: 'articles', total: 3, pages: 2, facets: null, sorts: [] });
    expect(news?.items.map((item) => item.id)).toEqual([ID(403), ID(402)]);
  });

  it('значения фильтров из сборки: цена, группы по магазину, коллекции — только у каталога', async () => {
    const withOptions = recordInputs(
      [
        product(ID(101), {
          options: [
            { id: 'g-1', name: 'Цвет ', values: [{ id: 'o-1', value: 'Синий', images: [], swatch: null }] },
            { id: 'g-2', name: 'Формат', values: [{ id: 'o-2', value: 'A4', images: [], swatch: null }] },
          ],
        }),
        product(ID(102), {
          handle: 'pled',
          price: 500000,
          options: [{ id: 'g-3', name: 'цвет', values: [{ id: 'o-3', value: 'Белый', images: [], swatch: null }] }],
        }),
        KASHEMIR,
      ],
      { catalog: list(2) },
    );
    const found = await listAt('/catalog', withOptions);
    expect(found?.facets).toEqual({
      price: { min: money(190000), max: money(500000) },
      groups: [
        {
          key: 'цвет',
          name: 'Цвет',
          values: [
            { value: 'Белый', selected: false },
            { value: 'Синий', selected: false },
          ],
        },
      ],
      collections: [{ slug: 'kashemir', title: 'Кашемир', selected: false }],
    });
  });

  it('с параметрами и ответом сервиса: карточки по id, всего — от сервиса, адреса — с ?page=', () => {
    const inputs = inputsOf();
    const source: ListSource = {
      kind: 'products',
      url: '/catalog',
      pages: 'built',
      collectionId: null,
      catalog: true,
      perPage: 2,
    };
    const query = parseListQuery(new URLSearchParams('sort=price_desc&page=2'));
    const found = pageListOf(recordIndex(inputs), inputs, source, query, {
      ids: [ID(103), 'нет-записи'],
      total: 6,
      facets: null,
    });
    expect(found.items.map((item) => item.id)).toEqual([ID(103)]);
    expect([found.total, found.pages, found.facets]).toEqual([6, 3, null]);
    expect([found.prev, found.next]).toEqual(['/catalog?sort=price_desc', '/catalog?page=3&sort=price_desc']);
    expect(found.sorts.find((sort) => sort.selected)?.value).toBe('price_desc');
    expect(
      errorOf(() =>
        pageListOf(recordIndex(inputs), inputs, source, { ...query, page: 4 }, { ids: [], total: 6, facets: null }),
      ),
    ).toMatchObject({ code: 'page-unknown' });
  });

  it('номера с многоточием: 10 страниц, текущая 5 и 1', () => {
    const inputs = recordInputs(
      Array.from({ length: 20 }, (_, n) => product(ID(200 + n), { handle: `p-${n}` })),
      { catalog: list(2) },
    );
    const source: ListSource = {
      kind: 'products',
      url: '/catalog',
      pages: 'built',
      collectionId: null,
      catalog: true,
      perPage: 2,
    };
    const pagesOf = (page: number) =>
      pageListOf(recordIndex(inputs), inputs, source, { ...EMPTY_LIST_QUERY, page }, null).links.map(
        (link) => link.page,
      );
    expect(pagesOf(5)).toEqual([1, null, 4, 5, 6, null, 10]);
    expect(pagesOf(1)).toEqual([1, 2, null, 10]);
    expect(pagesOf(10)).toEqual([1, null, 9, 10]);
  });

  it('главная без секции с per-page — списка нет; с ней — все товары, следующая — /?page=2', async () => {
    expect(
      listSourceAt(
        recordInputs(PRODUCTS, { home: [{ id: 'h-1', section: RECORD_SECTION, settings: {} }] }),
        '/',
        theme,
      ),
    ).toBeNull();
    const home = recordInputs(PRODUCTS, { home: list(2) });
    expect(listSourceAt(home, '/', theme)).toMatchObject({
      kind: 'products',
      pages: 'query',
      collectionId: null,
      perPage: 2,
    });
    const found = await listAt('/', home);
    expect([found?.url, found?.next, found?.pages]).toEqual(['/', '/?page=2', 3]);
    expect(shopRoutes(home).some((route) => route.path === '/page/2')).toBe(false);
  });

  it('главная, секция с пустым полем коллекции — все товары магазина: значение пустого поля не коллекция с id «»', async () => {
    const home = recordInputs(PRODUCTS, { home: list(2) });
    home.code.sections = home.code.sections.map((section) => ({
      ...section,
      recordFields: { collection: 'collection' },
    }));
    expect(listSourceAt(home, '/', theme)).toMatchObject({ kind: 'products', collectionId: null });
    const found = await listAt('/', home);
    expect([found?.total, found?.items.length]).toEqual([5, 2]);
  });
});

describe('строка манифеста и SEO страницы N', () => {
  it('страница N — list.page, тот же объект записи; заголовок «— страница N», canonical на себя', async () => {
    const page = await renderShopPage(inputsOf(), '/collections/kashemir/page/2', theme, recordPage());
    expect(checkPageRow(page.row)).toMatchObject({ list: { page: 2 }, entity: { type: 'collection', id: C1 } });
    const html = Buffer.from(page.file.content).toString('utf8');
    expect(html).toMatch(/<title>[^<]* — страница 2<\/title>/);
    expect(html).toContain('collections/kashemir/page/2');
  });

  it('страница без списка — без поля list', async () => {
    const page = await renderShopPage(inputsOf(), `/blogs/novosti/zapis-1`, theme, recordPage());
    expect(page.row.list).toBeUndefined();
  });
});

describe('сочетание по умолчанию — правило прода', () => {
  const productWith = (variants: ProductRecord['variants'], options: ProductRecord['options']): ProductRecord => ({
    id: 'p-with',
    title: 'Шарф',
    slug: 'sharf',
    url: '/product/sharf',
    description: '',
    price: money(190000),
    compareAtPrice: null,
    images: [],
    available: true,
    options,
    variants,
    collections: [],
    updatedAt: '2026-10-20T10:00:00.000Z',
  });
  const OPTIONS: ProductRecord['options'] = [
    {
      id: 'g-1',
      name: 'Цвет',
      values: [
        { id: 'grey', value: 'серый', images: [], swatch: null },
        { id: 'blue', value: 'синий', images: [], swatch: null },
      ],
    },
    {
      id: 'g-2',
      name: 'Длина',
      values: [
        { id: '150', value: '150 см', images: [], swatch: null },
        { id: '180', value: '180 см', images: [], swatch: null },
      ],
    },
  ];
  const variant = (id: string, color: string, length: string, available: boolean) => ({
    id,
    title: `${color} / ${length}`,
    price: money(190000),
    compareAtPrice: null,
    available,
    options: { Цвет: color, Длина: length },
  });

  it('первые значения групп — в наличии, иначе любое; нет — первое в наличии; нет — первое; вариантов нет — null', () => {
    expect(
      defaultVariantId(
        productWith([variant('b-180', 'синий', '180 см', true), variant('g-150', 'серый', '150 см', true)], OPTIONS),
      ),
    ).toBe('g-150');
    expect(
      defaultVariantId(
        productWith([variant('b-180', 'синий', '180 см', true), variant('g-150', 'серый', '150 см', false)], OPTIONS),
      ),
    ).toBe('g-150');
    expect(
      defaultVariantId(
        productWith([variant('b-150', 'синий', '150 см', false), variant('b-180', 'синий', '180 см', true)], OPTIONS),
      ),
    ).toBe('b-180');
    expect(defaultVariantId(productWith([variant('b-150', 'синий', '150 см', false)], OPTIONS))).toBe('b-150');
    expect(defaultVariantId(productWith([], OPTIONS))).toBeNull();
  });
});

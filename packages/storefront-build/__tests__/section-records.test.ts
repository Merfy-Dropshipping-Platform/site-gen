import { describe, expect, it } from 'vitest';
import { sectionInputTag } from '../src/input-tag';
import { parseBuildInputs, type BuildInputs, type Entity } from '../src/inputs';
import { renderShopPage, type ShopTheme } from '../src/page';
import { money, recordIndexOf, type RecordEntry, type RecordType } from '../src/records';
import {
  menusWithRecordPaths,
  recordDepsOf,
  sectionData,
  sectionRecords,
  type RecordFieldKind,
} from '../src/section-records';
import {
  NO_PAGE_PROPS,
  type PageProps,
  type PlacedSection,
  type SectionRenderRequest,
  type SettingValues,
} from '../src/sections-render';
import { errorOf, rawInputs } from './support';
import {
  A1,
  B1,
  C1,
  ID,
  P1,
  P2,
  RECORD_HASH,
  SITE_KEY,
  article,
  blog,
  collection,
  placed,
  policy,
  product,
  recordInputs,
  recordPage,
} from './support-records';
import { fakeRender, novaTokens } from './support-theme';

// Записи полей секции (блок 8 «Секций и SDK», часть 8г; design.md 8.9): выбранная запись, запись страницы и «как на
// проде» на других страницах; ссылки меню по id — основным адресом; data — в тег входных данных.
const theme: ShopTheme = { tokens: novaTokens, render: fakeRender };
// Товары — в порядке product.list, новые сверху: плед новее шарфа, хотя его id больше.
const ENTITIES: Entity[] = [
  product(P2, { title: 'Плед', handle: 'pled', price: 350000, collectionIds: [] }),
  product(P1),
  collection(C1),
  blog(B1),
  article(A1),
  policy('privacy', 'Мы бережём данные покупателей'),
];
const INDEX = recordIndexOf(ENTITIES);
const FIELDS: Readonly<Record<string, RecordFieldKind>> = {
  product: 'product',
  collection: 'collection',
  posts: 'blog',
  policy: 'policy',
};
const card = (settings: SettingValues, data?: PlacedSection['data']): PlacedSection => ({
  id: 'card-1',
  name: 'shop:product-card',
  hash: '',
  settings,
  recordFields: FIELDS,
  ...(data === undefined ? {} : { data }),
});
const EMPTY = { product: null, collection: '', posts: null, policy: null };
const NONE = { product: null, collection: null, posts: null, policy: null };
const entry = (type: RecordType, id: string): RecordEntry | null => INDEX.find(type, id);
const depsOf = (type: RecordType, id: string): string[] => entry(type, id)?.deps ?? [];
const HOME: PageProps = { ...NO_PAGE_PROPS, records: INDEX };
function pageOf(type: RecordType, id: string): PageProps {
  const found = entry(type, id);
  return { ...HOME, page: { id: type, path: found?.path ?? null, record: found?.record ?? null } };
}
// Карточка товара — те же поля, что у товаров коллекции записей (records.ts).
const cardOf = (found: RecordEntry | null) =>
  found?.type === 'product'
    ? {
        id: found.record.id,
        title: found.record.title,
        url: found.record.url,
        price: found.record.price,
        compareAtPrice: found.record.compareAtPrice,
        image: found.record.images[0] ?? null,
        available: found.record.available,
        images: found.record.images.slice(0, 2),
      }
    : null;
const jsonOf = (tag: string): unknown => JSON.parse(tag.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''));

describe('записи полей секции', () => {
  it('выбрана запись — она: по id или адресу, у политики — по типу; на шаблоне своего вида — тоже она', () => {
    const chosen = { product: P2, collection: 'kashemir', posts: 'novosti', policy: 'privacy' };
    const expected = {
      product: entry('product', P2)?.record,
      collection: entry('collection', C1)?.record,
      posts: entry('blog', B1)?.record,
      policy: entry('policy', 'privacy')?.record,
    };
    expect(sectionRecords(card(chosen), HOME).values).toEqual(expected);
    const onProduct = sectionRecords(card({ ...chosen, product: 'pled' }), pageOf('product', P1));
    expect(onProduct.values.product).toEqual(expected.product);
  });

  it('пусто на шаблоне своего вида — запись страницы', () => {
    expect(sectionRecords(card(EMPTY), pageOf('product', P2)).values.product).toEqual(entry('product', P2)?.record);
    expect(sectionRecords(card(EMPTY), pageOf('collection', C1)).values.collection).toEqual(
      entry('collection', C1)?.record,
    );
    expect(sectionRecords(card(EMPTY), pageOf('blog', B1)).values.posts).toEqual(entry('blog', B1)?.record);
    expect(sectionRecords(card(EMPTY), pageOf('policy', 'privacy')).values.policy).toEqual(
      entry('policy', 'privacy')?.record,
    );
  });

  it('пусто на других страницах — как на проде: товары по порядку входов, записи всех блогов; политики нет', () => {
    const fromCollection = entry('collection', C1);
    const fromBlog = entry('blog', B1);
    expect(fromCollection?.type === 'collection' && fromCollection.record.products[0]).toEqual(
      cardOf(entry('product', P1)),
    );
    const { values } = sectionRecords(card(EMPTY), HOME);
    expect(values.product).toEqual(entry('product', P2)?.record);
    expect(values.collection).toEqual({
      id: '',
      title: '',
      slug: '',
      url: '',
      description: '',
      images: [],
      productsCount: 2,
      products: [cardOf(entry('product', P2)), cardOf(entry('product', P1))],
    });
    expect(values.posts).toEqual({
      id: '',
      title: '',
      handle: '',
      url: '',
      articlesCount: 1,
      articles: fromBlog?.type === 'blog' ? fromBlog.record.articles : [],
    });
    expect(values.policy).toBeNull();
  });

  it('записи нет, другой вид, нет индекса — null; товаров и статей нет — null', () => {
    const missing = { product: 'missing', collection: 'sharf', posts: 'missing', policy: 'refund' };
    expect(sectionRecords(card(missing), HOME).values).toEqual(NONE);
    expect(sectionRecords(card({ product: P2 }), NO_PAGE_PROPS).values).toEqual(NONE);
    const bare = { ...NO_PAGE_PROPS, records: recordIndexOf([policy('privacy', 'Текст')]) };
    expect(sectionRecords(card(EMPTY), bare).values).toEqual(NONE);
  });

  it('deps — записи, которые показала секция, без повторов; запись страницы — нет: она уже в строке страницы', () => {
    const all = [...depsOf('product', P2), ...depsOf('product', P1), ...depsOf('article', A1)];
    expect(sectionRecords(card({ ...EMPTY, product: P2 }), HOME).deps).toEqual([
      ...new Set([...depsOf('product', P2), ...all]),
    ]);
    expect(sectionRecords(card(EMPTY), pageOf('product', P2)).deps).toEqual([...new Set(all)]);
    const only: PlacedSection = { ...card({ product: P2 }), recordFields: { product: 'product' } };
    const plain: PlacedSection = { id: 'hero-1', name: 'shop:hero', hash: '', settings: {} };
    expect(recordDepsOf([only, plain], HOME)).toEqual([`product:${P2}`]);
  });

  it('лимиты: 24 товара и 12 статей, счётчики — все', () => {
    const many = [
      ...Array.from({ length: 30 }, (_, n) => product(ID(1000 + n), { handle: `sharf-${n}`, collectionIds: [] })),
      blog(B1),
      ...Array.from({ length: 15 }, (_, n) => article(ID(2000 + n), { slug: `linen-${n}` })),
    ];
    const { values } = sectionRecords(card(EMPTY), { ...NO_PAGE_PROPS, records: recordIndexOf(many) });
    expect(values.collection).toHaveProperty('products.length', 24);
    expect(values.collection).toHaveProperty('productsCount', 30);
    expect(values.posts).toHaveProperty('articles.length', 12);
    expect(values.posts).toHaveProperty('articlesCount', 15);
  });

  it('ссылки меню на записи по id — основным адресом, на всех трёх уровнях; без индекса — то же меню', () => {
    const leaf = { label: 'Кашемир', url: `/collections/${C1}`, items: [] };
    const middle = { label: 'Шарф', url: '/product/sharf', items: [leaf] };
    const menus = {
      main: {
        title: 'Меню',
        items: [
          { label: 'Плед', url: `/product/${P2}`, items: [middle] },
          { label: 'О нас', url: '/o-nas', items: [] },
        ],
      },
    };
    expect(menusWithRecordPaths(menus, INDEX)).toEqual({
      main: {
        title: 'Меню',
        items: [
          {
            label: 'Плед',
            url: '/product/pled',
            items: [{ ...middle, items: [{ ...leaf, url: '/collections/kashemir' }] }],
          },
          { label: 'О нас', url: '/o-nas', items: [] },
        ],
      },
    });
    expect(menusWithRecordPaths(menus, undefined)).toBe(menus);
  });

  it('data — только объявленные поля записи; записи нет — null; тег входных данных — с data', () => {
    const data = {
      product: { from: 'settings.product', fields: ['id', 'title', 'price'] },
      page: { from: 'page.record', fields: ['title', 'url'] },
    };
    const onCollection = pageOf('collection', C1);
    const values = sectionRecords(card({ product: P2 }), onCollection).values;
    expect(sectionData({ data }, onCollection.page, values)).toEqual({
      product: { id: P2, title: 'Плед', price: money(350000) },
      page: { title: 'Кашемир', url: '/collections/kashemir' },
    });
    const missing = sectionRecords(card({ product: 'missing' }), HOME).values;
    expect(sectionData({ data }, HOME.page, missing)).toEqual({ product: null, page: null });
    const scripted: PlacedSection = { ...card({ product: P2 }, data), script: true };
    const tag = sectionInputTag(scripted, sectionRecords(scripted, HOME).data);
    expect(jsonOf(tag)).toMatchObject({
      data: { product: { id: P2, title: 'Плед', price: money(350000) }, page: null },
    });
  });
});

describe('записи полей в странице магазина и во входах сборки', () => {
  const RECORD_CARD = 'shop:record-card';
  const withCard = (inputs: BuildInputs): BuildInputs => ({
    ...inputs,
    code: {
      ...inputs.code,
      sections: [
        ...inputs.code.sections,
        {
          name: RECORD_CARD,
          kind: 'section',
          hash: RECORD_HASH,
          render: RECORD_HASH,
          script: null,
          recordFields: { product: 'product' },
        },
      ],
    },
  });

  it('запрос рендера — records по полям секции; строка страницы — их deps; без полей — без records', async () => {
    const instance = { id: 'card-1', section: RECORD_CARD, settings: { product: P2 } };
    const inputs = withCard(recordInputs(ENTITIES, { home: [instance, placed('plain-1')] }));
    const requests: SectionRenderRequest[] = [];
    const { row } = await renderShopPage(inputs, '/', theme, recordPage(requests));
    expect(requests.map((request) => request.records)).toEqual([{ product: entry('product', P2)?.record }, undefined]);
    expect(row.deps).toEqual([`product:${P2}`, SITE_KEY]);
  });

  it('входы: recordFields и data секции — по схеме; другой вид или имя data не по правилу — inputs-invalid', () => {
    const section = { name: RECORD_CARD, kind: 'section', hash: RECORD_HASH, render: RECORD_HASH, script: null };
    const withSection = (extra: object): unknown =>
      rawInputs((raw) =>
        Object.assign(raw, { code: { sections: [{ ...section, ...extra }], pages: {}, globals: [] } }),
      );
    const keys = {
      recordFields: { product: 'product' },
      data: { product: { from: 'settings.product', fields: ['id'] } },
    };
    expect(parseBuildInputs(withSection(keys)).code.sections[0]).toMatchObject(keys);
    expect(errorOf(() => parseBuildInputs(withSection({ recordFields: { product: 'article' } }))).code).toBe(
      'inputs-invalid',
    );
    const badName = { data: { 'main-photo': { from: 'page.record', fields: ['id'] } } };
    expect(errorOf(() => parseBuildInputs(withSection(badName))).code).toBe('inputs-invalid');
  });
});

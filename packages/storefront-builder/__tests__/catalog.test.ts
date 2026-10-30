import { describe, expect, it } from 'vitest';
import { COLLECTIONS_PATTERN, PRODUCT_UPDATED_AT, collectionEntityOf, productEntityOf } from '../src/catalog';
import type { LogFields } from '../src/log';
import { PRODUCT_QUEUE, fetchCollections, fetchProducts, type Shop } from '../src/snapshot';

// Каталог для сборки новой темы (блок 8 «Секций и SDK», часть 8а): ответы product.list и
// product.collections.storefront → сущности входов. Только публичные поля, цены — в копейках.
const SHOP: Shop = {
  id: '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70',
  tenantId: 'org-1',
  name: 'Шарфы',
  themeId: 'nova',
  themeVersion: null,
  status: 'published',
  publicUrl: 'https://scarf.dev.merfy.ru',
  description: '',
  seoTitle: '',
  keywords: '',
  logoUrl: '',
  signature: '',
  updatedAt: '2026-10-20T10:00:00.000Z',
};

function requestOf(answer: unknown) {
  const calls: unknown[][] = [];
  const logged: [string, LogFields][] = [];
  const request = {
    call: (...args: unknown[]) => {
      calls.push(args);
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    },
    timeoutMs: 4_000,
    log: (event: string, fields: LogFields = {}) => {
      logged.push([event, fields]);
    },
  };
  return { request, calls, logged };
}

// Элемент ответа product.list (product, products-microservice.controller.ts, handleListProducts) — все его поля.
const ITEM = {
  id: 'p-1',
  name: 'Шарф',
  description: 'Тёплый шарф из льна',
  price: 1900,
  compareAtPrice: 2500,
  costPrice: 700,
  sku: 'SH-1',
  weight: 0.2,
  weightUnit: 'kg',
  isPhysicalProduct: true,
  metaTitle: 'Купить шарф',
  metaDescription: null,
  images: ['https://s3.merfy.ru/p/1.jpg'],
  slug: 'sharf',
  hasVariants: true,
  allowBackorder: false,
  available: true,
  variantGroups: [
    {
      id: 'g-2',
      name: 'Размер',
      position: 1,
      options: [{ id: 'o-3', value: 'M', position: 0, images: [], swatchHex: null }],
    },
    {
      id: 'g-1',
      name: 'Цвет',
      position: 0,
      options: [
        { id: 'o-2', value: 'Синий', position: 1, images: ['https://s3.merfy.ru/o/2.jpg'], swatchHex: '#1d4ed8' },
        { id: 'o-1', value: 'Красный', position: 0, images: [], swatchHex: '#dc2626' },
      ],
    },
  ],
  variantSwatches: [{ value: 'Красный', color: '#dc2626', available: true }],
  collections: [{ id: 'c-1', name: 'Кашемир', slug: 'kashemir' }],
  variantCombinations: [
    {
      id: 'v-1',
      title: 'Красный / M',
      price: 2100,
      compareAtPrice: null,
      available: true,
      quantity: 3,
      allowBackorder: false,
      options: { Цвет: 'Красный', Размер: 'M' },
    },
    {
      id: 'v-2',
      title: 'Синий / M',
      price: null,
      compareAtPrice: 3000,
      available: false,
      quantity: 0,
      allowBackorder: false,
      options: { Цвет: 'Синий', Размер: 'M' },
    },
  ],
  updatedAt: '2026-10-20T10:00:00.000Z',
};

const COLLECTION = {
  id: 'c-1',
  name: 'Кашемир',
  slug: 'kashemir',
  description: 'Тёплые шарфы',
  images: ['https://s3.merfy.ru/c/1.jpg'],
  metaTitle: 'Кашемировые шарфы',
  metaDescription: null,
  updatedAt: '2026-10-20T10:00:00.000Z',
  productIds: ['p-2', 'p-1'],
};

describe('товар product.list → сущность', () => {
  it('публичные поля, цены в копейках, группы и значения по position; вариант без цены — цена товара', () => {
    expect(productEntityOf(ITEM)).toEqual({
      type: 'product',
      id: 'p-1',
      updatedAt: '2026-10-20T10:00:00.000Z',
      data: {
        title: 'Шарф',
        handle: 'sharf',
        description: 'Тёплый шарф из льна',
        price: 190000,
        compareAtPrice: 250000,
        images: ['https://s3.merfy.ru/p/1.jpg'],
        available: true,
        preorder: false,
        options: [
          {
            id: 'g-1',
            name: 'Цвет',
            values: [
              { id: 'o-1', value: 'Красный', images: [], swatch: '#dc2626' },
              { id: 'o-2', value: 'Синий', images: ['https://s3.merfy.ru/o/2.jpg'], swatch: '#1d4ed8' },
            ],
          },
          { id: 'g-2', name: 'Размер', values: [{ id: 'o-3', value: 'M', images: [], swatch: null }] },
        ],
        variants: [
          {
            id: 'v-1',
            title: 'Красный / M',
            price: 210000,
            compareAtPrice: 250000,
            available: true,
            options: { Цвет: 'Красный', Размер: 'M' },
          },
          {
            id: 'v-2',
            title: 'Синий / M',
            price: 190000,
            compareAtPrice: 300000,
            available: false,
            options: { Цвет: 'Синий', Размер: 'M' },
          },
        ],
        collectionIds: ['c-1'],
        seo: { title: 'Купить шарф', description: '' },
      },
    });
  });

  it('закрытых полей нет: правка себестоимости, артикула и веса сущность не меняет', () => {
    const entity = productEntityOf(ITEM);
    const text = JSON.stringify(entity);
    for (const field of [
      'costPrice',
      'sku',
      'weight',
      'quantity',
      'allowBackorder',
      'isPhysicalProduct',
      'variantSwatches',
    ])
      expect(text).not.toContain(`"${field}"`);
    expect(productEntityOf({ ...ITEM, costPrice: 999, sku: 'SH-2', weight: 5 })).toEqual(entity);
  });

  it('ответ без даты, описания и вариантов — постоянная дата и пустые поля', () => {
    expect(productEntityOf({ id: 'p-2', name: 'Плед', price: 0, available: false })).toEqual({
      type: 'product',
      id: 'p-2',
      updatedAt: PRODUCT_UPDATED_AT,
      data: {
        title: 'Плед',
        handle: '',
        description: '',
        price: 0,
        compareAtPrice: null,
        images: [],
        available: false,
        preorder: false,
        options: [],
        variants: [],
        collectionIds: [],
        seo: { title: '', description: '' },
      },
    });
  });

  it('preorder из ответа product — в данных товара; без поля или не булево — false', () => {
    const data = (raw: unknown) => (productEntityOf(raw)?.data as { preorder?: boolean } | undefined)?.preorder;
    expect(data({ ...ITEM, available: true, preorder: true })).toBe(true);
    expect(data({ ...ITEM, preorder: false })).toBe(false);
    expect(data(ITEM)).toBe(false);
    expect(data({ ...ITEM, preorder: 'yes' })).toBe(false);
  });

  it('старая цена 0 — её нет; 1900,5 ₽ — 190050 копеек; дата с поясом — в UTC', () => {
    const entity = productEntityOf({
      ...ITEM,
      price: 1900.5,
      compareAtPrice: 0,
      variantCombinations: [],
      updatedAt: '2026-10-20T13:00:00+03:00',
    });
    expect(entity?.data).toMatchObject({ price: 190050, compareAtPrice: null });
    expect(entity?.updatedAt).toBe('2026-10-20T10:00:00.000Z');
  });

  it('без id, названия или числа в цене — не товар', () => {
    expect(productEntityOf({ name: 'Шарф', price: 1 })).toBeNull();
    expect(productEntityOf({ id: 'p-1', name: '', price: 1 })).toBeNull();
    expect(productEntityOf({ id: 'p-1', name: 'Шарф', price: '1900' })).toBeNull();
    expect(productEntityOf(null)).toBeNull();
  });
});

describe('коллекция product.collections.storefront → сущность', () => {
  it('поля коллекции, товары — по порядку мерчанта; дата с поясом — в UTC', () => {
    expect(collectionEntityOf(COLLECTION)).toEqual({
      type: 'collection',
      id: 'c-1',
      updatedAt: '2026-10-20T10:00:00.000Z',
      data: {
        title: 'Кашемир',
        handle: 'kashemir',
        description: 'Тёплые шарфы',
        images: ['https://s3.merfy.ru/c/1.jpg'],
        productIds: ['p-2', 'p-1'],
        seo: { title: 'Кашемировые шарфы', description: '' },
      },
    });
    const zoned = collectionEntityOf({ ...COLLECTION, updatedAt: '2026-10-20T13:00:00+03:00' });
    expect(zoned?.updatedAt).toBe('2026-10-20T10:00:00.000Z');
  });

  it('не по форме — не коллекция', () => {
    expect(collectionEntityOf({ ...COLLECTION, productIds: 'p-1' })).toBeNull();
    expect(collectionEntityOf({ ...COLLECTION, updatedAt: 'вчера' })).toBeNull();
    expect(collectionEntityOf({ ...COLLECTION, name: 7 })).toBeNull();
  });
});

describe('запросы каталога', () => {
  it('коллекции — product.collections.storefront очереди product; неверная — без неё и строка журнала', async () => {
    const { request, calls, logged } = requestOf({
      success: true,
      data: [COLLECTION, { ...COLLECTION, id: 'c-2', name: 7 }],
    });
    expect((await fetchCollections(request, SHOP))?.map((entity) => entity.id)).toEqual(['c-1']);
    expect(calls).toEqual([[PRODUCT_QUEUE, COLLECTIONS_PATTERN, { tenantId: 'org-1', siteId: SHOP.id }, 4_000]]);
    expect(logged).toEqual([['collection-invalid', { shopId: SHOP.id, id: 'c-2' }]]);
  });

  it('неуспех, ошибка или ответ не по форме — null и строка collections-failed', async () => {
    for (const answer of [{ success: false }, new Error('тайм-аут'), 'мусор']) {
      const { request, logged } = requestOf(answer);
      expect(await fetchCollections(request, SHOP)).toBeNull();
      expect(logged.map(([event]) => event)).toEqual(['collections-failed']);
    }
  });

  it('товар не по форме — без него и строка product-invalid; остальные — в снимке', async () => {
    const { request, calls, logged } = requestOf({ success: true, data: [ITEM, { id: 'p-9', name: 'Без цены' }] });
    expect((await fetchProducts(request, SHOP))?.map((entity) => entity.id)).toEqual(['p-1']);
    expect(calls).toEqual([[PRODUCT_QUEUE, 'product.list', { tenantId: 'org-1', siteId: SHOP.id }, 4_000]]);
    expect(logged).toEqual([['product-invalid', { shopId: SHOP.id, id: 'p-9' }]]);
  });
});

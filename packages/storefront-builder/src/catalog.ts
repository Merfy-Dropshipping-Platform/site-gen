import type { CollectionData, Entity, ProductData } from '@merfy/storefront-build';
import { z } from 'zod';

// Каталог магазина для сборки новой темы (блок 8 «Секций и SDK», часть 8а): ответы сервиса product → сущности входов.
// Во входы — только публичные поля (Р8а-3): себестоимость, артикул, вес, остатки, «Продавать, когда закончился» и
// признак физического товара сюда не попадают — ни в HTML, ни в ключ сборки. Цены — копейки (Р8а-11).

// Ответ product.list без даты правки (сервис до части 8а) — постоянная дата: ключ сборки меняет только правка данных.
export const PRODUCT_UPDATED_AT = '1970-01-01T00:00:00.000Z';
export const COLLECTIONS_PATTERN = 'product.collections.storefront';

const instant = z.iso.datetime({ offset: true });
const optionValueSchema = z.object({
  id: z.string(),
  value: z.string(),
  position: z.number().catch(0),
  images: z.array(z.string()).catch([]),
  swatchHex: z.string().nullable().catch(null),
});
const groupSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: z.number().catch(0),
  options: z.array(optionValueSchema).catch([]),
});
const combinationSchema = z.object({
  id: z.string(),
  title: z.string().catch(''),
  price: z.number().nullable().catch(null),
  compareAtPrice: z.number().nullable().catch(null),
  available: z.boolean().catch(false),
  options: z.record(z.string(), z.string()).catch({}),
});
// Обязательны id, название и цена; остальное не по форме — пусто, товар остаётся.
const productItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  price: z.number(),
  description: z.string().catch(''),
  compareAtPrice: z.number().nullable().catch(null),
  images: z.array(z.string()).catch([]),
  slug: z.string().catch(''),
  available: z.boolean().catch(false),
  // Остатка нет, заказ разрешён: сервис product отдаёт поле с части «под заказ»; без него — не под заказ.
  preorder: z.boolean().catch(false),
  metaTitle: z.string().nullable().catch(null),
  metaDescription: z.string().nullable().catch(null),
  variantGroups: z.array(groupSchema).catch([]),
  variantCombinations: z.array(combinationSchema).catch([]),
  collections: z.array(z.object({ id: z.string().optional().catch(undefined) })).catch([]),
  updatedAt: instant.nullable().catch(null),
});
// Ответ product.collections.storefront (product, collections.service.ts, StorefrontCollection) — все поля обязательны.
const collectionItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string(),
  description: z.string().nullable(),
  images: z.array(z.string()),
  metaTitle: z.string().nullable(),
  metaDescription: z.string().nullable(),
  updatedAt: instant,
  productIds: z.array(z.string()),
});

type ProductItem = z.infer<typeof productItemSchema>;

const kopecks = (rubles: number): number => Math.round(rubles * 100);
// Старая цена 0 или меньше — её нет.
const priceOrNull = (rubles: number | null): number | null => (rubles === null || rubles <= 0 ? null : kopecks(rubles));
const utc = (at: string): string => new Date(at).toISOString();
const byPosition = <T extends { position: number }>(items: readonly T[]): T[] =>
  [...items].sort((left, right) => left.position - right.position);

const optionsOf = (item: ProductItem): ProductData['options'] =>
  byPosition(item.variantGroups).map((group) => ({
    id: group.id,
    name: group.name,
    values: byPosition(group.options).map((option) => ({
      id: option.id,
      value: option.value,
      images: option.images,
      swatch: option.swatchHex,
    })),
  }));

// Вариант без своей цены — цена товара; без своей старой цены — старая цена товара.
const variantsOf = (item: ProductItem): ProductData['variants'] =>
  item.variantCombinations.map((variant) => ({
    id: variant.id,
    title: variant.title,
    price: kopecks(variant.price ?? item.price),
    compareAtPrice: priceOrNull(variant.compareAtPrice ?? item.compareAtPrice),
    available: variant.available,
    options: variant.options,
  }));

export function productEntityOf(raw: unknown): Entity | null {
  const parsed = productItemSchema.safeParse(raw);
  if (!parsed.success) return null;
  const item = parsed.data;
  const data: ProductData = {
    title: item.name,
    handle: item.slug,
    description: item.description,
    price: kopecks(item.price),
    compareAtPrice: priceOrNull(item.compareAtPrice),
    images: item.images,
    available: item.available,
    preorder: item.preorder,
    options: optionsOf(item),
    variants: variantsOf(item),
    collectionIds: item.collections.flatMap((collection) => (collection.id === undefined ? [] : [collection.id])),
    seo: { title: item.metaTitle ?? '', description: item.metaDescription ?? '' },
  };
  return {
    type: 'product',
    id: item.id,
    updatedAt: item.updatedAt === null ? PRODUCT_UPDATED_AT : utc(item.updatedAt),
    data,
  };
}

export function collectionEntityOf(raw: unknown): Entity | null {
  const parsed = collectionItemSchema.safeParse(raw);
  if (!parsed.success) return null;
  const item = parsed.data;
  const data: CollectionData = {
    title: item.name,
    handle: item.slug,
    description: item.description ?? '',
    images: item.images,
    productIds: item.productIds,
    seo: { title: item.metaTitle ?? '', description: item.metaDescription ?? '' },
  };
  return { type: 'collection', id: item.id, updatedAt: utc(item.updatedAt), data };
}

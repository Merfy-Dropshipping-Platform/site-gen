import type { CatalogItem, PriceMoney } from './types';

// Товар в ответах шлюза /store/products и /store/products/search (api-gateway: search-hit.ts, mapVariants) → строка
// для секций: без остатков, артикулов и себестоимости (находка 4 блока 11). Цены шлюза — рубли (факт 11): в копейки —
// round(рубли × 100). Ответ не по форме — null: вызывающий отвечает кодом server.

const SLUG = /^[\p{L}\p{N}]+(?:[-_][\p{L}\p{N}]+)*$/u;
const SLUG_MAX = 200;

// Адрес товара — правило recordSlug сборки (storefront-build, records.ts, Р8а-10).
export const productUrl = (handle: string, id: string): string =>
  `/product/${handle.length <= SLUG_MAX && SLUG.test(handle) ? handle : id}`;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function rublesOf(value: unknown): number | null {
  const number = typeof value === 'string' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) && number > 0 ? number : null;
}

export function priceOf(rubles: number, currency: string): PriceMoney {
  const amount = Math.round(rubles * 100);
  return { amount, currency, text: `${Math.round(amount / 100).toLocaleString('ru-RU')} ₽` };
}

const combinationsOf = (raw: Readonly<Record<string, unknown>>): readonly unknown[] =>
  Array.isArray(raw.variantCombinations) ? raw.variantCombinations : [];

function availableOf(raw: Readonly<Record<string, unknown>>): boolean {
  if (raw.hasVariants === true) return combinationsOf(raw).some((combo) => isRecord(combo) && combo.available === true);
  return (typeof raw.quantity === 'number' && raw.quantity > 0) || raw.allowBackorder === true;
}

function imageOf(raw: Readonly<Record<string, unknown>>): string | null {
  const first: unknown = Array.isArray(raw.images) ? raw.images[0] : null;
  return typeof first === 'string' && first !== '' ? first : null;
}

export function storeItemOf(raw: unknown, currency: string): CatalogItem | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.title !== 'string') return null;
  const handle = typeof raw.handle === 'string' ? raw.handle : '';
  const price = rublesOf(raw.basePrice) ?? 0;
  const old = rublesOf(raw.compareAtPrice);
  return {
    id: raw.id,
    title: raw.title,
    url: productUrl(handle, raw.id),
    image: imageOf(raw),
    price: priceOf(price, currency),
    compareAtPrice: old !== null && old > price ? priceOf(old, currency) : null,
    available: availableOf(raw),
    hasVariants: raw.hasVariants === true,
  };
}

// Список товаров ответа: элемент не по форме — без него; не список — null.
export function storeItemsOf(list: unknown, currency: string): CatalogItem[] | null {
  if (!Array.isArray(list)) return null;
  return list.flatMap((raw) => {
    const item = storeItemOf(raw, currency);
    return item === null ? [] : [item];
  });
}

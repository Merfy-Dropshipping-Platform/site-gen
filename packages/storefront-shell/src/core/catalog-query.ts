import type { CatalogQuery } from './types';

// Запрос модуля catalog: проверка входа и адрес шлюза. Отдельно от parts/catalog.ts: так часть остаётся тонкой, а вес
// ядра страницы (бюджет 16384 Б brotli) не зависит от правил каталога.

const LIMIT_MAX = 100;
const BADGES: readonly string[] = ['sale', 'new', 'low_stock', 'preorder', 'in_stock'];

// Целое из границ; не задано — подходит.
const isIntIn = (value: number | undefined, min: number, max: number): boolean =>
  value === undefined || (Number.isInteger(value) && value >= min && value <= max);

// Правила входа: первое сработавшее даёт текст отказа (код invalid). Страница и лимит — только у products.
const RULES: readonly {
  readonly paging: boolean;
  readonly bad: (query: CatalogQuery) => boolean;
  readonly text: string;
}[] = [
  {
    paging: true,
    bad: (query) => !isIntIn(query.page, 1, Infinity) || !isIntIn(query.limit, 1, LIMIT_MAX),
    text: 'page и limit — целые от 1, limit — до 100',
  },
  { paging: false, bad: (query) => !isIntIn(query.minDiscount, 1, 99), text: 'minDiscount — целое от 1 до 99' },
  { paging: false, bad: (query) => !isIntIn(query.newDays, 1, 365), text: 'newDays — целое от 1 до 365' },
  { paging: false, bad: (query) => !isIntIn(query.lowStockMax, 1, 1000), text: 'lowStockMax — целое от 1 до 1000' },
  {
    paging: false,
    bad: (query) => (query.badges ?? []).some((badge) => !BADGES.includes(badge)),
    text: 'badges — sale, new, low_stock, preorder или in_stock',
  },
  {
    paging: false,
    bad: (query) => (query.tags ?? []).some((tag) => typeof tag !== 'string' || tag.trim() === ''),
    text: 'tags — непустые строки',
  },
];

// Текст отказа по первому сработавшему правилу; запрос в порядке — undefined.
export const invalidText = (query: CatalogQuery, withPaging: boolean): string | undefined =>
  RULES.find((rule) => (withPaging || !rule.paging) && rule.bad(query))?.text;

// Параметры запроса → строка адреса шлюза: имена — как у StoreProductsQueryDto; группа вариантов — её ключ именем
// параметра (повтор — несколько значений, ИЛИ); коллекции, теги и признаки — повтором ключа (collection_id, tags,
// badge). Пустые значения не пишутся.
export function storeQueryOf(shopId: string, query: CatalogQuery, withPaging: boolean): URLSearchParams {
  const params = new URLSearchParams({ store_id: shopId });
  const single: [string, string | number | undefined][] = [
    ['page', withPaging ? query.page : undefined],
    ['limit', withPaging ? query.limit : undefined],
    ['sort', withPaging ? query.sort : undefined],
    ['min_price', query.minPrice],
    ['max_price', query.maxPrice],
    ['availability', query.availability],
    ['q', query.q?.trim() === '' ? undefined : query.q?.trim()],
    ['min_discount', query.minDiscount],
    ['new_days', query.newDays],
    ['low_stock_max', query.lowStockMax],
  ];
  const repeated: [string, readonly string[] | undefined][] = [
    ['collection_id', query.collectionIds],
    ['tags', query.tags],
    ['badge', query.badges],
    ...Object.entries(query.filters ?? {}),
  ];
  single.forEach(([name, value]) => {
    if (value !== undefined) params.append(name, String(value));
  });
  repeated.forEach(([name, values]) => (values ?? []).forEach((value) => params.append(name, value)));
  return params;
}

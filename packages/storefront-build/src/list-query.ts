// Параметры списка (блок 11 «Секций и SDK», часть 11а; design.md 11.4, В11-1): адрес списка → выбранное покупателем,
// канонический вид (ключ кеша рендера по запросу — тот же порядок у раздачи nginx, storefront/njs/route.js) и аргументы
// RPC сервиса product — те же, что строит шлюз (api-gateway src/store/store.controller.ts, getProducts и getFilters).
// Договор между репозиториями: имена и значения — только то, что шлюз принимает (правило владельца 19.10).

// Порядок — как в сортировке прода: «По популярности» (по остатку), «По новизне», «По убыванию цены», «По возрастанию цены».
export const LIST_SORTS = ['popular', 'newest', 'price_desc', 'price_asc'] as const;
export type ListSort = (typeof LIST_SORTS)[number];
export const LIST_AVAILABILITY = ['in_stock', 'sold_out'] as const;
export type ListAvailability = (typeof LIST_AVAILABILITY)[number];
export const LIST_FILTER_PREFIX = 'filter.';
export const LIST_Q_MAX = 500;
const PAGE_MAX = 100_000;
// Поля поиска каталога витрины — как STOREFRONT_SEARCH_FIELDS шлюза (store.service.ts).
export const STOREFRONT_SEARCH_FIELDS = ['title', 'sku'] as const;

export interface ListQuery {
  sort: ListSort | null;
  // Рубли, от 0.
  minPrice: number | null;
  maxPrice: number | null;
  availability: ListAvailability | null;
  // Адреса коллекций (slug) — товар хоть в одной; без повторов, по порядку.
  collections: string[];
  // Ключ группы вариантов → значения (ИЛИ внутри группы, И между группами).
  filters: Record<string, string[]>;
  q: string | null;
  // Номер страницы, от 1.
  page: number;
}

export const EMPTY_LIST_QUERY: ListQuery = Object.freeze({
  sort: null,
  minPrice: null,
  maxPrice: null,
  availability: null,
  collections: [],
  filters: {},
  q: null,
  page: 1,
});

const isOneOf = <T extends string>(values: readonly T[], value: string | null): value is T =>
  value !== null && values.some((candidate) => candidate === value);

const last = (params: URLSearchParams, name: string): string | null => params.getAll(name).at(-1) ?? null;

function priceOf(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function pageOf(raw: string | null): number {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= PAGE_MAX ? value : 1;
}

function qOf(raw: string | null): string | null {
  const text = raw?.trim() ?? '';
  return text === '' || text.length > LIST_Q_MAX ? null : text;
}

const unique = (values: readonly string[]): string[] => [...new Set(values.filter((value) => value.trim() !== ''))];

function filtersOf(params: URLSearchParams): Record<string, string[]> {
  const names = unique([...params.keys()].filter((name) => name.startsWith(LIST_FILTER_PREFIX)));
  const entries = names
    .map((name): [string, string[]] => [name.slice(LIST_FILTER_PREFIX.length), unique(params.getAll(name))])
    .filter(([key, values]) => key !== '' && values.length > 0);
  return Object.fromEntries(entries);
}

export function parseListQuery(params: URLSearchParams): ListQuery {
  const sort = last(params, 'sort');
  const availability = last(params, 'availability');
  return {
    sort: isOneOf(LIST_SORTS, sort) ? sort : null,
    minPrice: priceOf(last(params, 'min_price')),
    maxPrice: priceOf(last(params, 'max_price')),
    availability: isOneOf(LIST_AVAILABILITY, availability) ? availability : null,
    collections: unique(params.getAll('collection')),
    filters: filtersOf(params),
    q: qOf(last(params, 'q')),
    page: pageOf(last(params, 'page')),
  };
}

// Пары «имя — значение» выбранного; page=1 не пишется.
function pairsOf(query: ListQuery): [string, string][] {
  const single: [string, string | number | null][] = [
    ['sort', query.sort],
    ['min_price', query.minPrice],
    ['max_price', query.maxPrice],
    ['availability', query.availability],
    ['q', query.q],
    ['page', query.page > 1 ? query.page : null],
  ];
  const singles = single.flatMap(([name, value]): [string, string][] =>
    value === null ? [] : [[name, String(value)]],
  );
  const collections = query.collections.map((slug): [string, string] => ['collection', slug]);
  const filters = Object.entries(query.filters).flatMap(([key, values]) =>
    values.map((value): [string, string] => [`${LIST_FILTER_PREFIX}${key}`, value]),
  );
  return [...singles, ...collections, ...filters];
}

const byName = (left: [string, string], right: [string, string]): number => {
  if (left[0] === right[0]) return 0;
  return left[0] < right[0] ? -1 : 1;
};

// Канонический вид: имена по алфавиту (сравнение строк, как у раздачи), значения одного имени — по порядку выбора.
export function listQueryString(query: ListQuery): string {
  const pairs = pairsOf(query).sort(byName);
  return pairs.map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`).join('&');
}

// Выбрано ли что-то, кроме номера страницы.
export const listQueryIsEmpty = (query: ListQuery): boolean => listQueryString({ ...query, page: 1 }) === '';

type RpcFilterValue = string | string[];
// Одно значение — строкой, несколько — массивом: как rpcFilterValue шлюза (catalog-filters.ts).
const rpcValue = (values: readonly string[]): RpcFilterValue => (values.length === 1 ? (values[0] ?? '') : [...values]);

export interface FiltersRpcArgs {
  shopId: string;
  availability?: ListAvailability;
  search?: string;
  searchFields?: string[];
  minPrice?: number;
  maxPrice?: number;
  variantFilters?: Record<string, RpcFilterValue>;
}

export interface ProductsRpcArgs extends FiltersRpcArgs {
  skip: number;
  take: number;
  status: 'active';
  collectionId?: RpcFilterValue;
  sort?: string;
}

// Сортировка сервиса product: у него `popular` — новые сверху (так шлюз и называет «newest»), а «По популярности»
// прода — по остатку, `quantity_desc` (у товара с вариантами — сумма остатков сочетаний).
const RPC_SORTS: Record<ListSort, string> = {
  popular: 'quantity_desc',
  newest: 'popular',
  price_desc: 'price_desc',
  price_asc: 'price_asc',
};

// Цены местами, если от больше до (как шлюз).
function pricesOf(query: ListQuery): Pick<FiltersRpcArgs, 'minPrice' | 'maxPrice'> {
  const { minPrice, maxPrice } = query;
  const swap = minPrice !== null && maxPrice !== null && minPrice > maxPrice;
  const [low, high] = swap ? [maxPrice, minPrice] : [minPrice, maxPrice];
  return { ...(low === null ? {} : { minPrice: low }), ...(high === null ? {} : { maxPrice: high }) };
}

function sharedArgs(query: ListQuery): Omit<FiltersRpcArgs, 'shopId'> {
  const groups = Object.entries(query.filters);
  return {
    ...(query.availability === null ? {} : { availability: query.availability }),
    ...(query.q === null ? {} : { search: query.q, searchFields: [...STOREFRONT_SEARCH_FIELDS] }),
    ...pricesOf(query),
    ...(groups.length === 0
      ? {}
      : { variantFilters: Object.fromEntries(groups.map(([key, values]) => [key, rpcValue(values)])) }),
  };
}

// product.findAll: shopId — id магазина (siteId, как product.list сборщика); collectionIds — коллекция страницы или
// коллекции из collection=…, уже id; без сортировки — порядок сервиса.
export function productsRpcArgs(
  shopId: string,
  query: ListQuery,
  collectionIds: readonly string[],
  perPage: number,
): ProductsRpcArgs {
  return {
    shopId,
    skip: (query.page - 1) * perPage,
    take: perPage,
    status: 'active',
    ...(collectionIds.length === 0 ? {} : { collectionId: rpcValue(collectionIds) }),
    ...(query.sort === null ? {} : { sort: RPC_SORTS[query.sort] }),
    ...sharedArgs(query),
  };
}

// product.getFilters: значения фильтров по магазину — без страницы, сортировки и коллекций (факт 8).
export const filtersRpcArgs = (shopId: string, query: ListQuery): FiltersRpcArgs => ({ shopId, ...sharedArgs(query) });

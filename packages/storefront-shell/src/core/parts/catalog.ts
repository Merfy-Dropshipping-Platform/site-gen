import { filtersListOf } from '../catalog-filters';
import { catalogItemsOf } from '../catalog-items';
import { invalidText, storeQueryOf } from '../catalog-query';
import { type Failure, failed, failureOf, reasonOf, reportFailure } from '../failures';
import { requestJson } from '../requests';
import { priceOf } from '../store-items';
import type {
  ActionOptions,
  CatalogFilters,
  CatalogItem,
  CatalogModule,
  CatalogQuery,
  CoreHandle,
  Result,
  SdkPart,
} from '../types';

// Модуль «Каталог» (блок 11 «Секций и SDK», часть 11б; design.md 11.4, п. 13, Р11б-8): те же /store/products и
// /store/filters шлюза — для своих секций мерчанта. Наша секция «Каталог» (поведение catalog) ими не пользуется:
// список с фильтрами она получает готовым HTML. Разметки нет — параметры запроса не влезают в data-атрибуты.

type ProductsResult = Result<{
  readonly items: readonly CatalogItem[];
  readonly total: number;
  readonly page: number;
  readonly pages: number;
}>;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const countOf = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;

const fail = (core: CoreHandle, failure: Failure, options?: ActionOptions): Result<never> => {
  reportFailure(core, failure, options);
  return failed(failure);
};

// Параметры запроса и проверка входа — в catalog-query.ts; storeQueryOf остаётся доступным отсюда (тесты, секции).
export { storeQueryOf };

// Ответ /store/products → { items, total, page, pages }; не по форме — null.
function productsOf(
  reply: { readonly status: number; readonly body: unknown },
  currency: string,
): ProductsResult | null {
  const body = reply.body;
  if (reply.status < 200 || reply.status > 299 || !isRecord(body)) return null;
  const items = catalogItemsOf(body.products, currency);
  const pagination = isRecord(body.pagination) ? body.pagination : null;
  const total = countOf(body.total);
  const page = pagination === null ? null : countOf(pagination.page);
  const pages = pagination === null ? null : countOf(pagination.totalPages);
  if (items === null || total === null || page === null || pages === null) return null;
  return { ok: true, data: { items, total, page, pages } };
}

const groupOf = (raw: unknown): CatalogFilters['groups'][number] | null => {
  if (!isRecord(raw) || typeof raw.key !== 'string' || typeof raw.name !== 'string' || !Array.isArray(raw.values))
    return null;
  const values = raw.values.filter((value): value is string => typeof value === 'string');
  return { key: raw.key, name: raw.name, values };
};

// Ответ /store/filters → { groups, price, total, filters }; не по форме — null. Нет filters (старый шлюз) — пустой список.
function filtersOf(
  reply: { readonly status: number; readonly body: unknown },
  currency: string,
): Result<CatalogFilters> | null {
  const body = reply.body;
  if (reply.status < 200 || reply.status > 299 || !isRecord(body) || body.success !== true || !isRecord(body.data))
    return null;
  const data = body.data;
  if (!Array.isArray(data.groups)) return null;
  const groups = data.groups.flatMap((raw: unknown): readonly CatalogFilters['groups'][number][] => {
    const group = groupOf(raw);
    return group === null ? [] : [group];
  });
  const range = isRecord(data.priceRange) ? data.priceRange : null;
  const total = countOf(data.totalProducts);
  if (range === null || total === null) return null;
  const price = priceRangeOf(range, currency);
  return { ok: true, data: { groups, price, total, filters: filtersListOf(data.filters, currency) } };
}

const priceRangeOf = (range: Readonly<Record<string, unknown>>, currency: string): CatalogFilters['price'] => {
  const min = range.min;
  const max = range.max;
  if (typeof min !== 'number' || typeof max !== 'number' || max === 0) return null;
  return { min: priceOf(min, currency), max: priceOf(max, currency) };
};

// Запрос шлюза и разбор ответа: не по форме — server, ошибка шлюза — её причина.
async function ask<T>(
  core: CoreHandle,
  path: string,
  params: URLSearchParams,
  parse: (reply: { readonly status: number; readonly body: unknown }, currency: string) => Result<T> | null,
  author: string,
  options?: ActionOptions,
): Promise<Result<T>> {
  const config = core.config;
  if (config === null) {
    return fail(core, failureOf('server', `${author}: конфиг витрины не прочитан`), options);
  }
  const reply = await requestJson(`${config.api.url}${path}?${params}`, { method: 'GET' });
  const parsed = parse(reply, config.currency);
  return parsed ?? fail(core, failureOf(reasonOf(reply), `${author}: шлюз ответил не по форме`, reply), options);
}

export const catalog: SdkPart<'catalog', CatalogModule> = {
  name: 'catalog',
  create: (core: CoreHandle): CatalogModule => ({
    products: async (query: CatalogQuery = {}, options?: ActionOptions): Promise<ProductsResult> => {
      const invalid = invalidText(query, true);
      if (invalid !== undefined) return fail(core, failureOf('invalid', `catalog.products: ${invalid}`), options);
      const shopId = core.config?.shop.id ?? '';
      return ask(core, '/store/products', storeQueryOf(shopId, query, true), productsOf, 'catalog.products', options);
    },
    filters: async (query: Omit<CatalogQuery, 'page' | 'limit' | 'sort'> = {}, options?: ActionOptions) => {
      const invalid = invalidText(query, false);
      if (invalid !== undefined) return fail(core, failureOf('invalid', `catalog.filters: ${invalid}`), options);
      const shopId = core.config?.shop.id ?? '';
      return ask(core, '/store/filters', storeQueryOf(shopId, query, false), filtersOf, 'catalog.filters', options);
    },
  }),
};

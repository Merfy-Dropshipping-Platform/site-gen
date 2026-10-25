import {
  collectionIdsOf,
  filtersRpcArgs,
  listQueryIsEmpty,
  listSourceAt,
  money,
  parseListQuery,
  productsRpcArgs,
  recordIndex,
  type BuildInputs,
  type ListQuery,
  type ListRequest,
  type ListSource,
  type ListedPage,
  type ShopTheme,
} from '@merfy/storefront-build';
import { z } from 'zod';
import { StorefrontBuilderError, errorText } from './errors';
import { PRODUCT_QUEUE, type ProductRequest } from './snapshot';

// Страница списка с параметрами (блок 11 «Секций и SDK», часть 11а-2; design.md 11.4, В11-1 «как на проде»): товары этой
// страницы, сколько их всего и значения фильтров — у сервиса product, теми же RPC и аргументами, что у шлюза для витрин
// пяти тем (api-gateway src/store/store.controller.ts, getProducts и getFilters). Карточки строит сборка из своих записей
// по id: себестоимость и остатки из ответа сервиса в HTML не попадают (Р8а-2).
export const PRODUCTS_FIND = 'product.findAll';
export const PRODUCTS_FILTERS = 'product.getFilters';
// Длина параметров списка — как LIST_MAX раздачи (nginx-minio-proxy, storefront/njs/route.js).
export const LIST_ARGS_MAX = 2048;
const FAILED_LINE = 'list-failed';

// Ответы — как у products-microservice.controller.ts сервиса product; из товара нужен только id.
const findSchema = z.object({
  success: z.literal(true),
  data: z.array(z.object({ id: z.string().min(1) })),
  total: z.number().int().nonnegative(),
});
const filtersSchema = z.object({
  success: z.literal(true),
  data: z.object({
    groups: z.array(z.object({ name: z.string(), key: z.string(), values: z.array(z.string()) })),
    // Рубли, как basePrice сервиса; 0 и 0 — у магазина нет активных товаров.
    priceRange: z.object({ min: z.number().nonnegative(), max: z.number().nonnegative() }),
  }),
});
type FoundReply = z.infer<typeof findSchema>;
type FiltersReply = z.infer<typeof filtersSchema>;
type ProductsSource = Extract<ListSource, { kind: 'products' }>;

const kopecks = (rubles: number): number => Math.round(rubles * 100);

function facetsOf(filters: FiltersReply['data'], query: ListQuery): NonNullable<ListedPage['facets']> {
  const { min, max } = filters.priceRange;
  const price = max <= 0 ? null : { min: money(kopecks(min)), max: money(kopecks(max)) };
  const groups = filters.groups.map((group) => {
    const chosen = query.filters[group.key] ?? [];
    const values = group.values.map((value) => ({ value, selected: chosen.includes(value) }));
    return { key: group.key, name: group.name, values };
  });
  return { price, groups };
}

async function callChecked<T>(
  request: ProductRequest,
  shopId: string,
  pattern: string,
  data: unknown,
  schema: z.ZodType<T>,
): Promise<T> {
  try {
    return schema.parse(await request.call(PRODUCT_QUEUE, pattern, data, request.timeoutMs));
  } catch (error) {
    request.log(FAILED_LINE, { shopId, pattern, error: errorText(error) });
    throw new StorefrontBuilderError('rpc-failed', `${pattern}: ${errorText(error)}`, { cause: error });
  }
}

// Коллекции запроса: у каталога — из collection=… (адреса записей коллекций), у коллекции и секции — своя.
function collectionIdsFor(inputs: BuildInputs, source: ProductsSource, query: ListQuery): string[] {
  if (source.catalog) return collectionIdsOf(recordIndex(inputs), query.collections);
  return source.collectionId === null ? [] : [source.collectionId];
}

// Выбраны только коллекции, которых нет в записях, — пустой список: findAll без коллекции отдал бы все товары.
const nothingFound = (source: ProductsSource, query: ListQuery, ids: readonly string[]): boolean =>
  source.catalog && query.collections.length > 0 && ids.length === 0;

async function fetchListed(
  request: ProductRequest,
  shopId: string,
  source: ProductsSource,
  query: ListQuery,
  collectionIds: readonly string[],
): Promise<ListedPage> {
  const findArgs = productsRpcArgs(shopId, query, collectionIds, source.perPage);
  const found: Promise<FoundReply | null> = nothingFound(source, query, collectionIds)
    ? Promise.resolve(null)
    : callChecked(request, shopId, PRODUCTS_FIND, findArgs, findSchema);
  const filters = callChecked(request, shopId, PRODUCTS_FILTERS, filtersRpcArgs(shopId, query), filtersSchema);
  const [products, values] = await Promise.all([found, filters]);
  const ids = products === null ? [] : products.data.map((item) => item.id);
  return { ids, total: products === null ? 0 : products.total, facets: facetsOf(values.data, query) };
}

// Параметры списка (канонический вид, nginx route.js listArgs) → ListRequest для renderShopPage и pageListOf. Сервис
// product нужен, только когда список — товары и выбрано что-то, кроме номера страницы; иначе список строит сборка.
export async function listRequestOf(
  request: ProductRequest | undefined,
  shopId: string,
  inputs: BuildInputs,
  source: ListSource,
  rawList: string,
): Promise<ListRequest> {
  const query = parseListQuery(new URLSearchParams(rawList));
  if (request === undefined || source.kind !== 'products' || listQueryIsEmpty(query)) return { query, listed: null };
  return { query, listed: await fetchListed(request, shopId, source, query, collectionIdsFor(inputs, source, query)) };
}

// Список страницы по адресу (дорисовка): у страницы нет списка — undefined; страницы нет — page-unknown сборки (404).
export async function listAt(
  request: ProductRequest | undefined,
  shopId: string,
  inputs: BuildInputs,
  path: string,
  theme: ShopTheme,
  rawList: string,
): Promise<ListRequest | undefined> {
  const source = listSourceAt(inputs, path, theme);
  return source === null ? undefined : listRequestOf(request, shopId, inputs, source, rawList);
}

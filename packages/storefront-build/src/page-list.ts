import { StorefrontBuildError } from './errors';
import type { BuildInputs } from './inputs';
import { z } from 'zod';
import { LIST_SORTS, listQueryIsEmpty, listQueryString, type ListQuery } from './list-query';
import {
  BLOG_ARTICLES_MAX,
  COLLECTION_PRODUCTS_MAX,
  money,
  type ArticleCard,
  type Money,
  type ProductCard,
  type ProductOption,
  type ProductRecord,
  type RecordIndex,
} from './records';
import { CATALOG_PAGE_ID, CATALOG_PATH, type ShopRoute } from './routes';
import { sectionRecords } from './section-records';
import type { PageProps, PlacedSection } from './sections-render';

// Список страницы (блок 11 «Секций и SDK», часть 11а; design.md 11.2): карточки этой страницы, номера, выбранное,
// сортировки и значения фильтров. Его получает каждая секция страницы в Astro.props.page.list (Р11а-5).

export const PER_PAGE_SETTING = 'per-page';
export const PER_PAGE_MIN = 2;
export const PER_PAGE_MAX = 24;
// Подписи сортировок (design.md 11.4, п. 10): «Популярные» не предлагаем — у сервиса product это «новые сверху».
export const SORT_LABELS = {
  newest: 'Новые',
  price_asc: 'Цена по возрастанию',
  price_desc: 'Цена по убыванию',
  title_asc: 'По названию',
} as const;

export interface ListProductCard extends ProductCard {
  // Первые два фото — «Следующее фото при наведении».
  images: string[];
  // Сочетание по умолчанию (defaultVariantId); у товара без вариантов — null.
  variantId: string | null;
  hasVariants: boolean;
}
export interface PageListLink {
  // null — многоточие.
  page: number | null;
  url: string | null;
  current: boolean;
}
export interface ListFacets {
  price: { min: Money; max: Money } | null;
  groups: { key: string; name: string; values: { value: string; selected: boolean }[] }[];
  // Только у /catalog; у остальных списков — [].
  collections: { slug: string; title: string; selected: boolean }[];
}
export interface PageList {
  kind: 'products' | 'articles';
  items: ListProductCard[] | ArticleCard[];
  total: number;
  page: number;
  pages: number;
  perPage: number;
  // Адрес списка без номера и параметров: /catalog, /collections/kashemir, у списка секции — адрес страницы.
  url: string;
  prev: string | null;
  next: string | null;
  links: PageListLink[];
  query: ListQuery;
  // У статей — [].
  sorts: { value: string; label: string; selected: boolean }[];
  // У статей — null.
  facets: ListFacets | null;
}

// Чей список (Р11а-6). pages: built — страницы N собраны (…/page/N), query — следующая страница — адрес с ?page=N.
export type ListSource =
  | {
      kind: 'products';
      url: string;
      pages: 'built' | 'query';
      // Коллекция списка: страница коллекции или поле collection секции; null — все товары магазина.
      collectionId: string | null;
      // true — /catalog: фильтр по коллекциям и «Новые» по умолчанию.
      catalog: boolean;
      perPage: number;
    }
  | { kind: 'articles'; url: string; pages: 'built'; blogId: string; perPage: number };

// Ответ сервиса product для страницы с параметрами списка (план 11а-2): id карточек этой страницы по порядку, всего с
// фильтрами, значения фильтров (цена и группы; коллекции pageListOf читает из записей). Карточки — из записей сборки по
// id; id без записи пропускается.
export interface ListedPage {
  ids: string[];
  total: number;
  facets: Omit<ListFacets, 'collections'> | null;
}

// id записи из значения поля с записью (section-records): публичные поля или null.
const recordIdOf = (value: object | null): string | null =>
  value !== null && 'id' in value && typeof value.id === 'string' ? value.id : null;

const clampPerPage = (value: number): number => Math.max(PER_PAGE_MIN, Math.min(PER_PAGE_MAX, Math.floor(value)));

// Размер страницы (Р11а-7): настройка per-page первой сверху секции; нет — пределы записей блока 8.
function perPageOf(placed: readonly PlacedSection[], fallback: number): number {
  for (const section of placed) {
    const raw = section.settings[PER_PAGE_SETTING];
    if (typeof raw === 'number' && Number.isFinite(raw)) return clampPerPage(raw);
  }
  return fallback;
}

// Первое поле вида collection у секции (Р11а-6): его запись — коллекция списка.
function collectionFieldOf(section: PlacedSection): string | null {
  for (const [id, kind] of Object.entries(section.recordFields ?? {})) {
    if (kind === 'collection') return id;
  }
  return null;
}

// Коллекция секции: запись её поля collection; поле пустое — null (все товары магазина).
function collectionOfSection(section: PlacedSection, props: PageProps): string | null {
  const field = collectionFieldOf(section);
  if (field === null) return null;
  return recordIdOf(sectionRecords(section, props).values[field] ?? null);
}

// Чей список у страницы (Р11а-6): каталог, запись коллекции или блога (и их страницы N — по route.record); иначе —
// первая сверху секция с per-page и её поле collection; нет такой секции — null.
export function listSourceOf(
  inputs: BuildInputs,
  route: ShopRoute,
  placed: readonly PlacedSection[],
  props: PageProps,
): ListSource | null {
  const perPage = perPageOf(placed, COLLECTION_PRODUCTS_MAX);
  if (route.id === CATALOG_PAGE_ID)
    return { kind: 'products', url: CATALOG_PATH, pages: 'built', collectionId: null, catalog: true, perPage };
  if (route.id === 'collection' && route.record?.type === 'collection')
    return {
      kind: 'products',
      url: route.record.path,
      pages: 'built',
      collectionId: route.record.id,
      catalog: false,
      perPage,
    };
  if (route.id === 'blog' && route.record?.type === 'blog')
    return {
      kind: 'articles',
      url: route.record.path,
      pages: 'built',
      blogId: route.record.id,
      perPage: perPageOf(placed, BLOG_ARTICLES_MAX),
    };
  // Страница записи товара, статьи и политики (design.md 11.2): списка нет — список секции с per-page не её.
  if (route.record !== undefined) return null;
  return sectionListSourceOf(route, placed, props);
}

// Список из секции (Р11а-6): первая сверху секция с per-page и её поле collection.
function sectionListSourceOf(route: ShopRoute, placed: readonly PlacedSection[], props: PageProps): ListSource | null {
  for (const section of placed) {
    const raw = section.settings[PER_PAGE_SETTING];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    return {
      kind: 'products',
      url: route.path,
      pages: 'query',
      collectionId: collectionOfSection(section, props),
      catalog: false,
      perPage: clampPerPage(raw),
    };
  }
  return null;
}

// Сочетание по умолчанию — правило прода (site-gen origin/prod, packages/theme-base/runtime/variant-default.ts,
// pickDefaultCombination): сочетание первых значений групп — в наличии, иначе любое; нет — первое в наличии; нет —
// первое; вариантов нет — null.
export function defaultVariantId(product: ProductRecord): string | null {
  const firsts = product.options
    .filter((group) => group.values.length > 0)
    .map((group) => ({ name: group.name, value: group.values[0]?.value ?? '' }));
  const byFirst = product.variants.find((variant) =>
    firsts.every(({ name, value }) => variant.options[name] === value),
  );
  if (byFirst !== undefined) return byFirst.id;
  const inStock = product.variants.find((variant) => variant.available);
  return (inStock ?? product.variants[0])?.id ?? null;
}

const listProductCardOf = (record: ProductRecord): ListProductCard => ({
  id: record.id,
  title: record.title,
  url: record.url,
  price: record.price,
  compareAtPrice: record.compareAtPrice,
  image: record.images[0] ?? null,
  available: record.available,
  images: record.images.slice(0, 2),
  variantId: defaultVariantId(record),
  hasVariants: record.variants.length > 0,
});

// Товары каталога (Р11а-8): RecordIndex.products — новые сверху, как product.list.
const catalogProductsOf = (index: RecordIndex): ProductRecord[] => index.products.map((entry) => entry.record);

// Список читает у входов сборки только сущности: пробный рендер секций (section-samples.ts) собирает его по примерам.
export type ListInputs = { data: Pick<BuildInputs['data'], 'entities'> };

// Товары коллекции (Р11а-8): productIds в порядке мерчанта, только товары с записью.
const collectionDataSchema = z.object({ productIds: z.array(z.string()).catch([]) });

function collectionProductsOf(index: RecordIndex, inputs: ListInputs, collectionId: string): ProductRecord[] {
  const entity = inputs.data.entities.find(
    (candidate) => candidate.type === 'collection' && candidate.id === collectionId,
  );
  const data = entity === undefined ? null : collectionDataSchema.safeParse(entity.data);
  if (data === null || !data.success) return [];
  const found = data.data.productIds.map((id) => index.find('product', id));
  return found.flatMap((entry) => (entry?.type === 'product' ? [entry.record] : []));
}

const productsOf = (
  index: RecordIndex,
  inputs: ListInputs,
  source: Extract<ListSource, { kind: 'products' }>,
): ProductRecord[] =>
  source.collectionId === null ? catalogProductsOf(index) : collectionProductsOf(index, inputs, source.collectionId);

// Статьи блога (Р11а-8): новые сверху по publishedAt ?? updatedAt, при равенстве — по id (Р8а-14).
const publicationDataSchema = z.object({
  blogId: z.string(),
  publishedAt: z.string().nullable().catch(null),
});

interface PublicationSource {
  id: string;
  updatedAt: string;
  publishedAt: string | null;
}

const publicationsOf = (inputs: ListInputs, blogId: string): PublicationSource[] =>
  inputs.data.entities.flatMap((entity): PublicationSource[] => {
    if (entity.type !== 'publication') return [];
    const data = publicationDataSchema.safeParse(entity.data);
    return data.success && data.data.blogId === blogId
      ? [{ id: entity.id, updatedAt: entity.updatedAt, publishedAt: data.data.publishedAt }]
      : [];
  });

function articleCardsOf(index: RecordIndex, inputs: ListInputs, blogId: string): ArticleCard[] {
  const newest = publicationsOf(inputs, blogId).sort((left, right) => {
    const leftDate = left.publishedAt ?? left.updatedAt;
    const rightDate = right.publishedAt ?? right.updatedAt;
    if (leftDate !== rightDate) return leftDate < rightDate ? 1 : -1;
    return left.id < right.id ? -1 : 1;
  });
  return newest.flatMap((entity) => {
    const found = index.find('article', entity.id);
    return found?.type === 'article' ? [found.record] : [];
  });
}

// Адрес страницы n списка (Р11а-4): при built без параметров — …/page/n (первая — сам адрес), иначе — ?<параметры>.
function pageAddressOf(source: ListSource, query: ListQuery, page: number): string {
  if (source.pages === 'built' && listQueryIsEmpty(query))
    return page === 1 ? source.url : `${source.url}/page/${page}`;
  const params = listQueryString({ ...query, page });
  return params === '' ? source.url : `${source.url}?${params}`;
}

const pageNumbersOf = (page: number, pages: number): (number | null)[] => {
  if (pages <= 7) return Array.from({ length: pages }, (_, n) => n + 1);
  const middle = [page - 1, page, page + 1].filter((n) => n >= 2 && n <= pages - 1);
  return [1, ...(middle[0] > 2 ? [null] : []), ...middle, ...((middle.at(-1) ?? 1) < pages - 1 ? [null] : []), pages];
};

function linksOf(source: ListSource, query: ListQuery, page: number, pages: number): PageListLink[] {
  return pageNumbersOf(page, pages).map(
    (number): PageListLink => ({
      page: number,
      url: number === null ? null : pageAddressOf(source, query, number),
      current: number === page,
    }),
  );
}

const sortsOf = (source: ListSource, query: ListQuery): PageList['sorts'] => {
  if (source.kind !== 'products') return [];
  const selected = query.sort ?? (source.catalog ? 'newest' : null);
  return LIST_SORTS.map((value) => ({ value, label: SORT_LABELS[value], selected: selected === value }));
};

// Ключ группы — name.trim().toLowerCase() с пробелами в _; группа «формат» скрыта (Р11а-9).
const HIDDEN_GROUP_KEY = 'формат';
const groupKeyOf = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, '_');

// Группы вариантов — по опциям всех товаров магазина (Р11а-9): подпись — первое встреченное название, порядок групп —
// по первому появлению, значения — без повторов, по алфавиту.
function groupsOf(index: RecordIndex, query: ListQuery): ListFacets['groups'] {
  const groups = new Map<string, { name: string; values: Set<string> }>();
  const addOption = (option: ProductOption): void => {
    const key = groupKeyOf(option.name);
    if (key === HIDDEN_GROUP_KEY) return;
    const group = groups.get(key) ?? { name: option.name.trim(), values: new Set<string>() };
    option.values.forEach((value) => group.values.add(value.value));
    groups.set(key, group);
  };
  for (const entry of index.products) {
    entry.record.options.forEach(addOption);
  }
  return [...groups.entries()].map(([key, group]) => ({
    key,
    name: group.name,
    values: [...group.values].sort().map((value) => ({ value, selected: (query.filters[key] ?? []).includes(value) })),
  }));
}

function priceRangeOf(index: RecordIndex): ListFacets['price'] {
  const prices = index.products.map((entry) => entry.record.price.amount);
  if (prices.length === 0) return null;
  return { min: money(Math.min(...prices)), max: money(Math.max(...prices)) };
}

// Коллекции — только у /catalog (Р11а-9): все записи коллекций магазина.
function collectionsOf(index: RecordIndex, query: ListQuery): ListFacets['collections'] {
  return index.entries
    .filter((entry) => entry.type === 'collection')
    .map((entry) => ({
      slug: entry.record.slug,
      title: entry.record.title,
      selected: query.collections.includes(entry.record.slug),
    }));
}

// Значения фильтров из сборки (Р11а-9): цена и группы — по всем товарам магазина, коллекции — у каталога.
function facetsOf(index: RecordIndex, query: ListQuery, source: ListSource): ListFacets {
  if (source.kind !== 'products') return { price: null, groups: [], collections: [] };
  return {
    price: priceRangeOf(index),
    groups: groupsOf(index, query),
    collections: source.catalog ? collectionsOf(index, query) : [],
  };
}

// Карточки этой страницы без ответа сервиса: срез списка сборки.
const sliceOf = <T>(all: readonly T[], page: number, perPage: number): T[] =>
  all.slice((page - 1) * perPage, page * perPage);

// Карточки по ответу сервиса (Р11а-3): id без записи пропускается.
function listedCardsOf(index: RecordIndex, source: ListSource, listed: ListedPage): PageList['items'] {
  if (source.kind === 'articles') {
    return listed.ids.flatMap((id) => {
      const found = index.find('article', id);
      return found?.type === 'article' ? [found.record] : [];
    });
  }
  return listed.ids.flatMap((id) => {
    const found = index.find('product', id);
    return found?.type === 'product' ? [listProductCardOf(found.record)] : [];
  });
}

// Значения фильтров страницы: с ответом сервиса — его цена и группы, коллекции — из записей (Р11а-9).
function facetsOfPage(
  index: RecordIndex,
  query: ListQuery,
  source: ListSource,
  listed: ListedPage | null,
): ListFacets | null {
  if (source.kind === 'articles') return null;
  if (listed === null) return facetsOf(index, query, source);
  if (listed.facets === null) return null;
  return { ...listed.facets, collections: collectionsOf(index, query) };
}

// Карточки этой страницы: с ответом сервиса — по его id, без — срез списка сборки.
function itemsOf(
  index: RecordIndex,
  source: ListSource,
  query: ListQuery,
  listed: ListedPage | null,
  products: readonly ListProductCard[],
  articles: readonly ArticleCard[],
): PageList['items'] {
  if (listed !== null) return listedCardsOf(index, source, listed);
  if (source.kind === 'products') return sliceOf(products, query.page, source.perPage);
  return sliceOf(articles, query.page, source.perPage);
}

// page.list страницы: query — выбранное (номер — query.page); listed — ответ сервиса product или null (список из
// записей сборки). Номер больше последнего — StorefrontBuildError('page-unknown').
export function pageListOf(
  index: RecordIndex,
  inputs: ListInputs,
  source: ListSource,
  query: ListQuery,
  listed: ListedPage | null,
): PageList {
  const products = source.kind === 'products' ? productsOf(index, inputs, source).map(listProductCardOf) : [];
  const articles = source.kind === 'articles' ? articleCardsOf(index, inputs, source.blogId) : [];
  const total = listed?.total ?? products.length + articles.length;
  const pages = Math.max(1, Math.ceil(total / source.perPage));
  if (query.page > pages) throw new StorefrontBuildError('page-unknown', 'страница списка больше последней');
  const items = itemsOf(index, source, query, listed, products, articles);
  const facets = facetsOfPage(index, query, source, listed);
  return {
    kind: source.kind,
    items,
    total,
    pages,
    page: query.page,
    perPage: source.perPage,
    url: source.url,
    prev: query.page > 1 ? pageAddressOf(source, query, query.page - 1) : null,
    next: query.page < pages ? pageAddressOf(source, query, query.page + 1) : null,
    links: linksOf(source, query, query.page, pages),
    query,
    sorts: sortsOf(source, query),
    facets,
  };
}

// id коллекций по адресам из collection=… (каталог): адрес без записи пропускается.
export function collectionIdsOf(index: RecordIndex, slugs: readonly string[]): string[] {
  const collections = index.entries.filter((entry) => entry.type === 'collection');
  return [
    ...new Set(
      slugs.flatMap((slug) => collections.filter((entry) => entry.record.slug === slug).map((entry) => entry.id)),
    ),
  ];
}

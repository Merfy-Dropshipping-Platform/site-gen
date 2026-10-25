import { StorefrontBuildError } from './errors';
import type { BuildInputs } from './inputs';
import type { PageEntityType } from './manifest';
import { entityKey } from './entities';
import { defaultRecord, previewRecordIndex } from './record-preview';
import {
  RECORD_TYPES,
  recordIndexOf,
  recordPath,
  recordSlug,
  type RecordEntry,
  type RecordIndex,
  type RecordType,
} from './records';
import type { PageMode } from './sections-render';
import { HOME_PAGE, NOT_FOUND_PAGE_ID, type PageInfo } from './special-pages';

// Страницы магазина новой темы (design.md блока 4, Св-1): главная и свои страницы мерчанта (блок 1 «Секций и SDK»,
// часть 4, Р1-4-8). Страница рендерит три списка секций ревизии: шапку, свой список и подвал. Страницы товаров,
// коллекций и политик добавят строки сюда вместе с секциями — адрес, файл и чья это страница.
export interface ShopRoute {
  // id страницы в конфиге витрины (блок 3) и её список секций в ревизии.
  id: string;
  path: string;
  file: string;
  entity: PageEntityType;
  // Страница записи (блок 8 «Секций и SDK», часть 8б): запись страницы шаблона; нет — страница сайта.
  record?: RecordEntry;
  // Страница списка (блок 11 «Секций и SDK», часть 11а): номер страницы списка; нет — страница без своего списка.
  list?: { page: number };
  // Вторые адреса страницы списка — 301 на path (…/page/1); у записи свои — record.aliases.
  aliases?: string[];
}

export const HEADER_LIST = 'header';
export const FOOTER_LIST = 'footer';
export const SHOP_ROUTES: readonly ShopRoute[] = [{ id: 'home', path: '/', file: 'index.html', entity: 'site' }];
// Страница 404 (блок 7, часть 7а): адрес у сборки есть, строки в манифесте и карте сайта нет — раздача отдаёт её файл на
// любой неизвестный адрес.
export const NOT_FOUND_ROUTE: ShopRoute = { id: 'not-found', path: '/404', file: '404.html', entity: 'site' };

// Списки секций страницы по порядку: шапка, страница, подвал.
export const pageListsOf = (pageId: string): readonly string[] => [HEADER_LIST, pageId, FOOTER_LIST];

// Страница для секций (блок 7, часть 7а): id и адрес; у страницы 404 адреса нет — она отвечает на любой адрес.
// Запись страницы (часть 8б) — только у страницы записи; у остальных ключа нет, процесс рендера даст секции null.
export const pageInfoOf = (route: ShopRoute): PageInfo => ({
  id: route.id,
  path: route.id === NOT_FOUND_PAGE_ID ? null : route.path,
  ...(route.record === undefined ? {} : { record: route.record.record }),
});

// Записи сборки (часть 8б) — один индекс на сущности входов: сборка зовёт routeOf на каждую страницу, а записей у
// магазина — тысячи. Входы после разбора не меняются.
const indexes = new WeakMap<BuildInputs['data']['entities'], RecordIndex>();

export function recordIndex(inputs: BuildInputs): RecordIndex {
  const known = indexes.get(inputs.data.entities);
  if (known !== undefined) return known;
  const index = recordIndexOf(inputs.data.entities);
  indexes.set(inputs.data.entities, index);
  return index;
}

// Шаблон показан, когда в его списке есть видимый экземпляр (design.md блока 8, 8.2); скрытые не считаются (п. 22).
// Политика — и с пустым шаблоном: текст выводит платформа (В8-1 А, policy-text.ts).
export const templateShown = (inputs: BuildInputs, type: RecordType): boolean =>
  type === 'policy' || (inputs.code.pages[type] ?? []).some((instance) => instance.hidden !== true);

// Каталог (блок 11 «Секций и SDK», Р11а-1): особая страница catalog, адрес /catalog.
export const CATALOG_PAGE_ID = 'catalog';
export const CATALOG_PATH = '/catalog';
// Каталог показан, когда в его списке есть видимый экземпляр; скрытые не считаются.
export const catalogShown = (inputs: BuildInputs): boolean =>
  (inputs.code.pages[CATALOG_PAGE_ID] ?? []).some((instance) => instance.hidden !== true);
// shop.catalogUrl: CATALOG_PATH или null.
export const catalogUrlOf = (inputs: BuildInputs): string | null => (catalogShown(inputs) ? CATALOG_PATH : null);

// Страница записи: id — id шаблона (его список секций), адрес — основной адрес записи, файл — <адрес>/index.html.
const recordRouteOf = (entry: RecordEntry): ShopRoute => ({
  id: entry.type,
  path: entry.path,
  file: `${entry.path.slice(1)}/index.html`,
  entity: entry.entity.type,
  record: entry,
});

// Маршрут каталога (блок 11 «Секций и SDK», часть 11а, Р11а-1): первая страница списка, второй адрес — /catalog/page/1.
// В сборке — при показанном каталоге; в превью — всегда: мерчант ставит в каталог первую секцию.
function listRoutesOf(inputs: BuildInputs, mode: PageMode): ShopRoute[] {
  if (mode !== 'preview' && !catalogShown(inputs)) return [];
  return [
    {
      id: CATALOG_PAGE_ID,
      path: CATALOG_PATH,
      file: 'catalog/index.html',
      entity: 'site',
      list: { page: 1 },
      aliases: [`${CATALOG_PATH}/page/1`],
    },
  ];
}

interface Routes {
  list: readonly ShopRoute[];
  // По адресу — и страница 404.
  byPath: ReadonlyMap<string, ShopRoute>;
}

// Записи превью конструктора (часть 8б-2): записи магазина и примеры для видов, которых у магазина нет.
const previewIndex = (inputs: BuildInputs): RecordIndex =>
  previewRecordIndex(inputs.data.entities, recordIndex(inputs));

// Страницы записей по режиму: в сборке и дорисовке (live) — записи с показанным шаблоном; в превью конструктора
// (часть 8б-2) — все записи превью, и у шаблона без секций: мерчант ставит в него первую секцию. Примеры — только
// здесь, в сборку они не попадают.
const RECORD_ENTRIES: Readonly<Record<PageMode, (inputs: BuildInputs) => readonly RecordEntry[]>> = {
  live: (inputs) => recordIndex(inputs).entries.filter((entry) => templateShown(inputs, entry.type)),
  preview: (inputs) => previewIndex(inputs).entries,
};

const routesByMode: Readonly<Record<PageMode, WeakMap<BuildInputs, Routes>>> = {
  live: new WeakMap(),
  preview: new WeakMap(),
};

// Главная, свои страницы ревизии (/o-nas → o-nas/index.html; своя страница, как главная, — страница сайта) и страницы
// записей режима.
function routesOf(inputs: BuildInputs, mode: PageMode = 'live'): Routes {
  const known = routesByMode[mode].get(inputs);
  if (known !== undefined) return known;
  const own = (inputs.revision.pages ?? []).map(
    (page): ShopRoute => ({ id: page.id, path: page.slug, file: `${page.slug.slice(1)}/index.html`, entity: 'site' }),
  );
  // Каталог и страницы N списков (блок 11 «Секций и SDK», часть 11а) — после страниц записей.
  const records = RECORD_ENTRIES[mode](inputs).map(recordRouteOf);
  const list = [...SHOP_ROUTES, ...own, ...records, ...listRoutesOf(inputs, mode)];
  const byPath = new Map([...list, NOT_FOUND_ROUTE].map((route): [string, ShopRoute] => [route.path, route]));
  const routes = { list, byPath };
  routesByMode[mode].set(inputs, routes);
  return routes;
}

export const shopRoutes = (inputs: BuildInputs): readonly ShopRoute[] => routesOf(inputs).list;

// Без входов — только главная (стенд и тесты рисовальщика); со входами — страницы сборки или, в режиме preview,
// страницы превью конструктора (часть 8б-2).
export function routeOf(path: string, inputs?: BuildInputs, mode: PageMode = 'live'): ShopRoute {
  const route =
    inputs === undefined
      ? SHOP_ROUTES.find((candidate) => candidate.path === path)
      : routesOf(inputs, mode).byPath.get(path);
  if (route !== undefined) return route;
  throw new StorefrontBuildError('page-unknown', 'такой страницы у магазина нет', { path });
}

export const isRecordType = (value: string): value is RecordType => RECORD_TYPES.some((type) => type === value);

const decodedPath = (path: string): string => {
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
};

// Запись по id или по адресу от корня — ссылке, нажатой в превью (как есть или раскодированной); чужой вид — нет.
function recordById(index: RecordIndex, type: RecordType, id: string): RecordEntry | null {
  const found = id.startsWith('/') ? (index.atPath(id) ?? index.atPath(decodedPath(id))) : index.find(type, id);
  return found?.type === type ? found : null;
}

// Адрес записи шаблона в превью (часть 8б-2): запись record, иначе запись по умолчанию (record-preview.ts).
export function previewRecordPath(inputs: BuildInputs, type: RecordType, id: string | null): string | undefined {
  const index = previewIndex(inputs);
  const found = id === null ? null : recordById(index, type, id);
  return (found ?? defaultRecord(index, type))?.path;
}

// Страница по id для превью одного блока (часть 7а): главная, своя страница ревизии, 404 или шаблон записи с записью
// record — та же, что у превью страницы (часть 8б-2); другой id — главная.
export function pageInfoById(inputs: BuildInputs, id: string, record: string | null = null): PageInfo {
  // Каталог (блок 11, часть 11а) — и с пустым списком: превью блока на странице, которую мерчант ещё не сохранил.
  if (id === CATALOG_PAGE_ID) return pageInfoOf(routeOf(CATALOG_PATH, inputs, 'preview'));
  const path = isRecordType(id) ? previewRecordPath(inputs, id, record) : undefined;
  if (path !== undefined) return pageInfoOf(routeOf(path, inputs, 'preview'));
  const route = [...shopRoutes(inputs), NOT_FOUND_ROUTE].find((candidate) => candidate.id === id);
  return route === undefined ? HOME_PAGE : pageInfoOf(route);
}

// Совпавшие адреса записей (design.md блока 8, 8.2; Р8а-10): у товара или коллекции адрес по handle заняла запись
// раньше по id — запись получила адрес по id (page) или, если занят и он, страницы у неё нет (page: null). Строки
// журнала route-duplicate сборщика.
export interface RouteDuplicate {
  type: RecordType;
  id: string;
  // Адрес по handle, который заняла другая запись.
  path: string;
  page: string | null;
}

function movedFromHandle(entry: RecordEntry, handle: unknown): RouteDuplicate[] {
  if (entry.type !== 'product' && entry.type !== 'collection') return [];
  if (typeof handle !== 'string' || handle === entry.id || recordSlug(handle, entry.id) !== handle) return [];
  const path = recordPath[entry.type](handle);
  return entry.path === path ? [] : [{ type: entry.type, id: entry.id, path, page: entry.path }];
}

export function routeDuplicates(inputs: BuildInputs): RouteDuplicate[] {
  const index = recordIndex(inputs);
  const handles = new Map(
    inputs.data.entities.map((entity): [string, unknown] => [entityKey(entity.type, entity.id), entity.data.handle]),
  );
  const moved = index.entries.flatMap((entry) =>
    movedFromHandle(entry, handles.get(entityKey(entry.entity.type, entry.entity.id))),
  );
  return [...moved, ...index.duplicates.map((duplicate) => ({ ...duplicate, page: null }))];
}

import { StorefrontBuildError } from './errors';
import type { BuildInputs } from './inputs';
import type { PageEntityType } from './manifest';
import { recordIndexOf, type RecordEntry, type RecordIndex, type RecordType } from './records';
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

// Страница записи: id — id шаблона (его список секций), адрес — основной адрес записи, файл — <адрес>/index.html.
const recordRouteOf = (entry: RecordEntry): ShopRoute => ({
  id: entry.type,
  path: entry.path,
  file: `${entry.path.slice(1)}/index.html`,
  entity: entry.entity.type,
  record: entry,
});

interface Routes {
  list: readonly ShopRoute[];
  // По адресу — и страница 404.
  byPath: ReadonlyMap<string, ShopRoute>;
}

const routesByInputs = new WeakMap<BuildInputs, Routes>();

// Главная, свои страницы ревизии (/o-nas → o-nas/index.html; своя страница, как главная, — страница сайта) и страницы
// записей с показанным шаблоном.
function routesOf(inputs: BuildInputs): Routes {
  const known = routesByInputs.get(inputs);
  if (known !== undefined) return known;
  const own = (inputs.revision.pages ?? []).map(
    (page): ShopRoute => ({ id: page.id, path: page.slug, file: `${page.slug.slice(1)}/index.html`, entity: 'site' }),
  );
  const records = recordIndex(inputs)
    .entries.filter((entry) => templateShown(inputs, entry.type))
    .map(recordRouteOf);
  const list = [...SHOP_ROUTES, ...own, ...records];
  const byPath = new Map([...list, NOT_FOUND_ROUTE].map((route): [string, ShopRoute] => [route.path, route]));
  const routes = { list, byPath };
  routesByInputs.set(inputs, routes);
  return routes;
}

export const shopRoutes = (inputs: BuildInputs): readonly ShopRoute[] => routesOf(inputs).list;

// Без входов — только главная (стенд и тесты рисовальщика); со входами — и свои страницы.
export function routeOf(path: string, inputs?: BuildInputs): ShopRoute {
  const route =
    inputs === undefined ? SHOP_ROUTES.find((candidate) => candidate.path === path) : routesOf(inputs).byPath.get(path);
  if (route !== undefined) return route;
  throw new StorefrontBuildError('page-unknown', 'такой страницы у магазина нет', { path });
}

// Страница по id для превью одного блока (часть 7а): главная, своя страница ревизии или 404; другой id — главная.
export function pageInfoById(inputs: BuildInputs, id: string): PageInfo {
  const route = [...shopRoutes(inputs), NOT_FOUND_ROUTE].find((candidate) => candidate.id === id);
  return route === undefined ? HOME_PAGE : pageInfoOf(route);
}

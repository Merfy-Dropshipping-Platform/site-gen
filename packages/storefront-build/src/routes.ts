import { StorefrontBuildError } from './errors';
import type { BuildInputs } from './inputs';
import type { PageEntityType } from './manifest';
import { NOT_FOUND_PAGE_ID, type PageInfo } from './special-pages';

// Страницы магазина новой темы (design.md блока 4, Св-1): главная и свои страницы мерчанта (блок 1 «Секций и SDK»,
// часть 4, Р1-4-8). Страница рендерит три списка секций ревизии: шапку, свой список и подвал. Страницы товаров,
// коллекций и политик добавят строки сюда вместе с секциями — адрес, файл и чья это страница.
export interface ShopRoute {
  // id страницы в конфиге витрины (блок 3) и её список секций в ревизии.
  id: string;
  path: string;
  file: string;
  entity: PageEntityType;
}

export const HEADER_LIST = 'header';
export const FOOTER_LIST = 'footer';
export const SHOP_ROUTES: readonly ShopRoute[] = [{ id: 'home', path: '/', file: 'index.html', entity: 'site' }];

// Списки секций страницы по порядку: шапка, страница, подвал.
export const pageListsOf = (pageId: string): readonly string[] => [HEADER_LIST, pageId, FOOTER_LIST];

// Страница для секций (блок 7, часть 7а): id и адрес; у страницы 404 адреса нет — она отвечает на любой адрес.
export const pageInfoOf = (route: ShopRoute): PageInfo => ({
  id: route.id,
  path: route.id === NOT_FOUND_PAGE_ID ? null : route.path,
});

// Главная и свои страницы ревизии: /o-nas → o-nas/index.html. Своя страница, как главная, — страница сайта.
export const shopRoutes = (inputs: BuildInputs): ShopRoute[] => [
  ...SHOP_ROUTES,
  ...(inputs.revision.pages ?? []).map(
    (page): ShopRoute => ({ id: page.id, path: page.slug, file: `${page.slug.slice(1)}/index.html`, entity: 'site' }),
  ),
];

// Без входов — только главная (стенд и тесты рисовальщика); со входами — и свои страницы.
export function routeOf(path: string, inputs?: BuildInputs): ShopRoute {
  const routes = inputs === undefined ? SHOP_ROUTES : shopRoutes(inputs);
  const route = routes.find((candidate) => candidate.path === path);
  if (route !== undefined) return route;
  throw new StorefrontBuildError('page-unknown', 'такой страницы у магазина нет', { path });
}

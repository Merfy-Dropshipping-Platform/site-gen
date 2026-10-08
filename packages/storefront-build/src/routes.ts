import { StorefrontBuildError } from './errors';
import type { PageEntityType } from './manifest';

// Страницы магазина новой темы. В этапе секций нет (design.md блока 4, Св-1): одна главная. Страницы товаров, коллекций
// и политик добавят строки сюда вместе с секциями — адрес, файл и чья это страница.

export interface ShopRoute {
  // id страницы в конфиге витрины (блок 3).
  id: string;
  path: string;
  file: string;
  entity: PageEntityType;
}

export const SHOP_ROUTES: readonly ShopRoute[] = [{ id: 'home', path: '/', file: 'index.html', entity: 'site' }];

export function routeOf(path: string): ShopRoute {
  const route = SHOP_ROUTES.find((candidate) => candidate.path === path);
  if (route !== undefined) return route;
  throw new StorefrontBuildError('page-unknown', 'такой страницы у магазина нет', { path });
}

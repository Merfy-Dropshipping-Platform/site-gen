/**
 * Фаза 2 (слайсинг): первые сегменты маршрутов, которые НЕ нарезаются на
 * секции — их страницы остаются пред-собранными (блоб в превью, verbatim-дист
 * на live). Общий список для превью-форка (preview.controller) и
 * publish-пересадки (v2-live-pages): расхождение списков = превью и live
 * по-разному решают, какая страница «сложная».
 */
export const V2_COMPLEX_ROUTE_PREFIXES = new Set([
  // catalog/collection/collections СНЯТЫ из замка (098 wiring): Catalog.astro
  // Container-API-safe и несёт data-puck-component-id на корневом <section>,
  // поэтому каталог/коллекции теперь нарезаются на секции в превью (выделяемы
  // и hot-replace), а не отдаются блобом. См. preview.controller v2-форк.
  'product',
  'products',
  'cart',
  'checkout',
  'auth',
  'blog',
  'legal',
  'account',
  'design-system',
  'puck-editor',
]);

/** Сложный ли маршрут (по первому сегменту). Пустой маршрут (home) — контентный. */
export function isV2ComplexRoute(route: string): boolean {
  return V2_COMPLEX_ROUTE_PREFIXES.has(route.split('/')[0]);
}

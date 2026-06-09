/**
 * Фаза 2 (слайсинг): первые сегменты маршрутов, которые НЕ нарезаются на
 * секции — их страницы остаются пред-собранными (блоб в превью, verbatim-дист
 * на live). Общий список для превью-форка (preview.controller) и
 * publish-пересадки (v2-live-pages): расхождение списков = превью и live
 * по-разному решают, какая страница «сложная».
 */
export const V2_COMPLEX_ROUTE_PREFIXES = new Set([
  'catalog',
  'collection',
  'collections',
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

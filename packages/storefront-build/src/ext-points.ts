import { EXT_POINTS, isExtPoint, type ExtPointPart } from '@merfy/shell/ext-points';
import type { StorefrontExtPoints } from '@merfy/storefront-config';

// Части мест блоков расширений по местам, которые объявили включённые расширения магазина (блок 15 «Секций и SDK»,
// часть 15д, Р15д-4): место → часть — EXT_POINTS ядра. Без повторов, по алфавиту; мест нет — пусто. По ней сборщик
// пишет вход code.extPointParts (15г) рядом с code.extPoints.
export function partsOfExtPoints(points: StorefrontExtPoints | undefined): ExtPointPart[] {
  const parts = new Set<ExtPointPart>();
  for (const places of Object.values(points ?? {}))
    for (const place of Object.keys(places)) if (isExtPoint(place)) parts.add(EXT_POINTS[place]);
  return [...parts].sort();
}

// Части мест на каждой странице с бандлом (часть 15г): у карточек каталога места product нет, а «В корзину» у товара
// с формой расширения прячет часть purchase.
export const EVERY_PAGE_EXT_POINT_PARTS: readonly ExtPointPart[] = ['purchase'];

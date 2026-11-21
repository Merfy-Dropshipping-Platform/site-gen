import { isRecord, storeItemOf } from './store-items';
import type { CatalogItem } from './types';

// Карточка каталога (модуль catalog): карточка шлюза плюс признаки, скидка, остаток и теги (контракт фильтров, п. 4).
// Поля считает продуктовый сервис одними выражениями с фильтром; SDK их только читает. Значение не той формы — пустой
// список или null: карточку из-за него не выбрасываем. Отдельно от store-items.ts: тот входит в ядро страницы, а
// каталог — нет, и вес ядра от этих полей не растёт.

const stringsOf = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry !== '') : [];

// Целое в заданных границах; иначе null.
const integerIn = (value: unknown, min: number, max: number): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : null;

const DISCOUNT_MAX = 100;

export function catalogItemOf(raw: unknown, currency: string): CatalogItem | null {
  const card = storeItemOf(raw, currency);
  if (card === null || !isRecord(raw)) return null;
  return {
    ...card,
    badges: stringsOf(raw.badges),
    discountPercent: integerIn(raw.discountPercent, 1, DISCOUNT_MAX),
    stockLeft: integerIn(raw.stockLeft, 0, Number.MAX_SAFE_INTEGER),
    tags: stringsOf(raw.tags),
  };
}

// Список товаров ответа: элемент не по форме — без него; не список — null.
export function catalogItemsOf(list: unknown, currency: string): CatalogItem[] | null {
  if (!Array.isArray(list)) return null;
  return list.flatMap((raw) => {
    const item = catalogItemOf(raw, currency);
    return item === null ? [] : [item];
  });
}

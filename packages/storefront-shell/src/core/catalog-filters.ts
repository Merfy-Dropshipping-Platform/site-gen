import { isRecord, priceOf } from './store-items';
import type { CatalogFilter, CatalogFilterOption, CatalogListFilter, CatalogRangeFilter } from './types';

// Динамичные фильтры каталога (контракт фильтров, п. 5): список `filters` ответа /store/filters. SDK ничего не знает о
// конкретных группах — разбирает форму по `type`. Незнакомый `kind` и незнакомые поля фильтра и опций (swatch,
// histogram, …) отдаются как есть; фильтр не по форме — выбрасывается, остальные остаются.

type Raw = Readonly<Record<string, unknown>>;
type Parser = (raw: Raw, currency: string) => CatalogFilter | null;

const compact = <T>(list: readonly (T | null)[]): T[] => list.filter((entry): entry is T => entry !== null);

const stringOf = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

const countOf = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;

const numberOf = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

// Значение: нет value, label или count — без него. Не булево selected — не выбрано.
function optionOf(raw: unknown): CatalogFilterOption | null {
  if (!isRecord(raw)) return null;
  const value = stringOf(raw.value);
  const label = stringOf(raw.label);
  const count = countOf(raw.count);
  if (value === null || label === null || count === null) return null;
  return { ...raw, value, label, count, selected: raw.selected === true };
}

const optionsOf = (raw: unknown): readonly CatalogFilterOption[] | null =>
  Array.isArray(raw) ? compact(raw.map(optionOf)) : null;

// Общие поля фильтра: key и label — строки; нет kind — по ключу.
const headOf = (raw: Raw): { readonly key: string; readonly kind: string; readonly label: string } | null => {
  const key = stringOf(raw.key);
  const label = stringOf(raw.label);
  return key === null || label === null ? null : { key, kind: stringOf(raw.kind) ?? key, label };
};

// list и flags: список options и имя параметра запроса.
function listOf(raw: Raw): CatalogListFilter | null {
  const head = headOf(raw);
  const param = stringOf(raw.param);
  const options = optionsOf(raw.options);
  const type = raw.type === 'flags' ? 'flags' : 'list';
  return head === null || param === null || options === null ? null : { ...raw, ...head, type, param, options };
}

// Деньги — только у цены; у прочих диапазонов число шлюза.
const boundOf = (kind: string, value: number, currency: string): CatalogRangeFilter['min'] =>
  kind === 'price' ? priceOf(value, currency) : value;

function rangeOf(raw: Raw, currency: string): CatalogRangeFilter | null {
  const head = headOf(raw);
  const min = numberOf(raw.min);
  const max = numberOf(raw.max);
  if (head === null || min === null || max === null) return null;
  const bounds = { min: boundOf(head.kind, min, currency), max: boundOf(head.kind, max, currency) };
  return { ...raw, ...head, type: 'range', ...bounds };
}

// Разбор по type; незнакомый type — без фильтра. Map, а не объект: type вроде «constructor» не должен находить метод.
const PARSERS: ReadonlyMap<unknown, Parser> = new Map<unknown, Parser>([
  ['list', listOf],
  ['flags', listOf],
  ['range', rangeOf],
]);

const filterOf = (raw: unknown, currency: string): CatalogFilter | null =>
  isRecord(raw) ? (PARSERS.get(raw.type)?.(raw, currency) ?? null) : null;

// Список filters ответа; нет поля (старый шлюз) или не список — пустой.
export const filtersListOf = (raw: unknown, currency: string): readonly CatalogFilter[] =>
  Array.isArray(raw) ? compact(raw.map((entry) => filterOf(entry, currency))) : [];

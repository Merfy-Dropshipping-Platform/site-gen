import { z } from 'zod';
import { LIST_FILTER_PREFIX, isListBadge, type ListBadge, type ListQuery } from './list-query';

// Динамичные фильтры списка (контракт фильтров каталога, часть 1, п. 5): page.list.facets.filters — один вид на все
// группы, секция рисует его по type и ничего не знает о конкретных группах. Источник — filters ответа
// product.getFilters или, без ответа сервиса, снимок записей сборки (snapshotFilters). Здесь у каждого фильтра имя
// параметра — адреса витрины (как у формы фильтров секции), у значения — готовая ссылка «выбрать / снять».
// Незнакомые kind и поля проходят как есть: части 2–3 (свои группы мерчанта, swatch, histogram) не правят сборщик.

export const BADGE_LABELS: Record<ListBadge, string> = {
  sale: 'Со скидкой',
  new: 'Новинки',
  low_stock: 'Мало осталось',
  preorder: 'Предзаказ',
  in_stock: 'В наличии',
};

export interface ListFilterOption {
  // Значение параметра адреса витрины: у коллекций — адрес записи (slug), у остальных — значение сервиса.
  value: string;
  label: string;
  // Сколько товаров будет, если выбрать значение (п. 5 контракта, «Как считается count»).
  count: number;
  selected: boolean;
  // Адрес первой страницы списка с этим значением выбранным (selected: false) или снятым (selected: true).
  url: string;
}
interface ListFilterBase {
  key: string;
  kind: string;
  type: string;
  label: string;
  // Адрес списка без значений этого фильтра; ничего не выбрано — null.
  clearUrl: string | null;
}
export interface ListRangeFilter extends ListFilterBase {
  type: 'range';
  // Имена параметров адреса витрины для «от» и «до».
  params: { min: string; max: string };
  // Рубли, как у сервиса product.
  min: number;
  max: number;
}
export interface ListOptionsFilter extends ListFilterBase {
  // Имя параметра адреса витрины: badge, collection, tag или filter.<ключ группы>.
  param: string;
  options: ListFilterOption[];
}
export type ListFilter = ListRangeFilter | ListOptionsFilter;

// Что нужно, чтобы превратить фильтр сервиса в фильтр страницы.
export interface FilterContext {
  query: ListQuery;
  // Адрес первой страницы списка с этим выбранным.
  addressOf: (query: ListQuery) => string;
  // Адрес записи коллекции по id; записи нет — null (значение не показать ссылкой).
  slugOf: (collectionId: string) => string | null;
  // Коллекции — только у /catalog, как facets.collections.
  catalog: boolean;
}

// Разбор ответа сервиса: лишние поля проходят (looseObject), фильтр или значение не той формы отбрасываются.
const optionSchema = z.looseObject({
  value: z.string(),
  label: z.string(),
  count: z.number().int().nonnegative(),
  selected: z.boolean(),
});
const baseShape = { key: z.string().min(1), kind: z.string().min(1), label: z.string() };
const rangeSchema = z.looseObject({ ...baseShape, type: z.literal('range'), min: z.number(), max: z.number() });
const optionsSchema = z.looseObject({
  ...baseShape,
  type: z.string().min(1),
  param: z.string().min(1),
  options: z.array(z.unknown()),
});
type RangeReply = z.infer<typeof rangeSchema>;
type OptionsReply = z.infer<typeof optionsSchema>;
type OptionReply = z.infer<typeof optionSchema>;

// Выбранные значения фильтра в ListQuery и их запись обратно: по ним — selected, ссылка значения и «сбросить».
interface Lens {
  param: string;
  read: (query: ListQuery) => readonly string[];
  write: (query: ListQuery, values: string[]) => ListQuery;
}

const withGroup = (filters: ListQuery['filters'], key: string, values: string[]): ListQuery['filters'] => {
  const rest = Object.fromEntries(Object.entries(filters).filter(([name]) => name !== key));
  return values.length === 0 ? rest : { ...rest, [key]: values };
};

// Группа по ключу: filter.<ключ>, в RPC — variantFilters. Им же идут незнакомые kind со списком значений — другого
// канала в адресе витрины у них нет.
const groupLens = (key: string): Lens => ({
  param: `${LIST_FILTER_PREFIX}${key}`,
  read: (query) => query.filters[key] ?? [],
  write: (query, values) => ({ ...query, filters: withGroup(query.filters, key, values) }),
});

const LENSES: Readonly<Record<string, Lens>> = {
  badge: {
    param: 'badge',
    read: (query) => query.badges,
    write: (query, values) => ({ ...query, badges: values.filter(isListBadge) }),
  },
  collection: {
    param: 'collection',
    read: (query) => query.collections,
    write: (query, values) => ({ ...query, collections: values }),
  },
  tag: { param: 'tag', read: (query) => query.tags, write: (query, values) => ({ ...query, tags: values }) },
};

const lensOf = (kind: string, param: string): Lens => LENSES[kind] ?? groupLens(param);

const toggled = (values: readonly string[], value: string): string[] =>
  values.includes(value) ? values.filter((candidate) => candidate !== value) : [...values, value];

const clearUrlOf = (context: FilterContext, lens: Lens): string | null =>
  lens.read(context.query).length === 0 ? null : context.addressOf(lens.write(context.query, []));

// Значение сервиса → значение адреса: у коллекции id → slug (нет записи — значения нет), у остальных — как есть.
const VALUE_OF: Readonly<Record<string, (value: string, context: FilterContext) => string | null>> = {
  collection: (id, context) => context.slugOf(id),
};
const addressValueOf = (kind: string, value: string, context: FilterContext): string | null =>
  (VALUE_OF[kind] ?? ((same: string) => same))(value, context);

function optionOf(raw: unknown, filter: OptionsReply, lens: Lens, context: FilterContext): ListFilterOption | null {
  const parsed = optionSchema.safeParse(raw);
  if (!parsed.success) return null;
  const value = addressValueOf(filter.kind, parsed.data.value, context);
  if (value === null) return null;
  const chosen = lens.read(context.query);
  const option: OptionReply = parsed.data;
  return {
    ...option,
    value,
    selected: chosen.includes(value),
    url: context.addressOf(lens.write(context.query, toggled(chosen, value))),
  };
}

// Фильтр со значениями: без единого значения не отдаётся (п. 5 контракта).
function optionsFilterOf(filter: OptionsReply, context: FilterContext): ListOptionsFilter | null {
  const lens = lensOf(filter.kind, filter.param);
  const options = filter.options.flatMap((raw) => optionOf(raw, filter, lens, context) ?? []);
  if (options.length === 0) return null;
  return { ...filter, param: lens.param, options, clearUrl: clearUrlOf(context, lens) };
}

// Цена — параметры адреса витрины min_price и max_price; другие диапазоны (часть 3) — как есть, без «сбросить»: в
// адресе витрины им пока нет параметров.
const PRICE_PARAMS = { min: 'min_price', max: 'max_price' } as const;
function priceFilterOf(filter: RangeReply, context: FilterContext): ListRangeFilter {
  const { query } = context;
  const chosen = query.minPrice !== null || query.maxPrice !== null;
  const clearUrl = chosen ? context.addressOf({ ...query, minPrice: null, maxPrice: null }) : null;
  return { ...filter, params: { ...PRICE_PARAMS }, clearUrl };
}

const rangeParamsSchema = z.object({ min: z.string(), max: z.string() });
function otherRangeOf(filter: RangeReply): ListRangeFilter {
  const parsed = rangeParamsSchema.safeParse(filter.params);
  return { ...filter, params: parsed.success ? parsed.data : { min: '', max: '' }, clearUrl: null };
}

const RANGES: Readonly<Record<string, (filter: RangeReply, context: FilterContext) => ListRangeFilter>> = {
  price: priceFilterOf,
};
const rangeFilterOf = (filter: RangeReply, context: FilterContext): ListRangeFilter =>
  (RANGES[filter.kind] ?? otherRangeOf)(filter, context);

// Коллекции — только у /catalog: у коллекции и списка секции коллекция задана страницей.
const shownHere = (kind: string, context: FilterContext): boolean => kind !== 'collection' || context.catalog;

function pageFilterOf(raw: unknown, context: FilterContext): ListFilter | null {
  const range = rangeSchema.safeParse(raw);
  if (range.success) return rangeFilterOf(range.data, context);
  const options = optionsSchema.safeParse(raw);
  if (!options.success || !shownHere(options.data.kind, context)) return null;
  return optionsFilterOf(options.data, context);
}

// filters ответа сервиса (или снимка) → page.list.facets.filters; порядок — как у источника.
export const pageFiltersOf = (raw: readonly unknown[], context: FilterContext): ListFilter[] =>
  raw.flatMap((filter) => pageFilterOf(filter, context) ?? []);

// ——— Снимок записей сборки (без ответа сервиса) ———
// Тот же вид и тот же смысл счётчика, что у getFilters без выбранного: сколько товаров списка с этим значением. Чего в
// записях сборки нет, того нет и здесь: признаков (одно определение — SQL сервиса product, контракт п. 3), тегов и
// признака коллекции по умолчанию (без него фильтр коллекций разошёлся бы с сервисом).

export interface SnapshotProduct {
  // Рубли: цена «от».
  price: number;
  // Группы вариантов: ключ — как у сервиса (filterKeyOf), подпись, значения.
  groups: readonly { key: string; name: string; values: readonly string[] }[];
}

// Ключ группы у фильтра — как у сервиса product (LOWER(vg.name)): нижний регистр, пробелы не заменяются. Его понимает
// фильтр выдачи; у старого groups[].key пробелы заменены на «_», и группа из нескольких слов по нему не фильтрует.
export const filterKeyOf = (name: string): string => name.toLowerCase();

interface CountedValue {
  value: string;
  label: string;
  count: number;
}

// Сколько товаров с каждым значением: один товар — одно значение один раз.
function countsOf(perProduct: readonly (readonly string[])[]): Map<string, number> {
  const counts = new Map<string, number>();
  perProduct.forEach((values) => new Set(values).forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1)));
  return counts;
}

const unselectedOptions = (values: readonly CountedValue[]) => values.map((value) => ({ ...value, selected: false }));

function snapshotPrice(products: readonly SnapshotProduct[]): object[] {
  if (products.length === 0) return [];
  const prices = products.map((product) => product.price);
  const range = { min: Math.min(...prices), max: Math.max(...prices) };
  return [{ key: 'price', kind: 'price', type: 'range', label: 'Цена', params: { ...PRICE_PARAMS }, ...range }];
}

const byText = (left: string, right: string): number => left.localeCompare(right, 'ru');
const minText = (left: string | undefined, right: string): string =>
  left === undefined || right < left ? right : left;

// Группы вариантов — как у сервиса (catalog-facets.ts): подпись — наименьшее из названий группы (MIN(vg.name)),
// значения — по алфавиту, группы — по подписи.
function snapshotGroups(products: readonly SnapshotProduct[]) {
  const names = new Map<string, string>();
  products.forEach((product) =>
    product.groups.forEach((group) => names.set(group.key, minText(names.get(group.key), group.name))),
  );
  return [...names.entries()]
    .sort(([, left], [, right]) => byText(left, right))
    .map(([key, name]) => {
      const perProduct = products.map((product) =>
        product.groups.filter((group) => group.key === key).flatMap((group) => group.values),
      );
      const values = [...countsOf(perProduct).entries()]
        .sort(([left], [right]) => byText(left, right))
        .map(([value, count]): CountedValue => ({ value, label: value, count }));
      return { key, kind: 'variant', type: 'list', label: name, param: key, options: unselectedOptions(values) };
    });
}

// Фильтры снимка в виде ответа сервиса: price, затем группы по имени (п. 5 контракта); дальше — тот же pageFiltersOf,
// что у ответа сервиса (выбранное, ссылки, пустые отброшены). Коллекций нет: в записях сборки не отличить коллекцию по
// умолчанию («все товары»), которую сервис в фильтр не отдаёт.
export const snapshotFilters = (products: readonly SnapshotProduct[]): unknown[] => [
  ...snapshotPrice(products),
  ...snapshotGroups(products),
];

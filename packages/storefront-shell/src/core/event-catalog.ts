import type { ErrorCode, EventDetail, EventMap, EventName, Money } from './types';

// Каталог событий витрины (блок 9: 13а А, «Решил сам» пп. 11–13) — договор с секциями мерчантов, «своим кодом» (16б Г),
// проверкой при сохранении (5б: event-unknown) и документацией для ИИ (блок 14). Типы данных — EventMap в types.ts;
// satisfies ниже сверяет с ними каталог: поле без правила или правило не того вида — ошибка типов. Внутри "sdk": 1 имя и
// поле можно только добавить. На витрине данные не проверяются: checkEventDetail — для превью и тестов.

// Вид поля: строка; строка или null; целое от 0; деньги { amount — копейки, целое от 0; currency — непустая строка };
// одно из значений (optional — поля может не быть).
export type FieldRule =
  | 'text'
  | 'text-or-null'
  | 'count'
  | 'money'
  | { readonly oneOf: readonly string[]; readonly optional?: true };

type RuleOf<T> = [T] extends [Money]
  ? 'money'
  : [T] extends [number]
    ? 'count'
    : [T] extends [string]
      ? string extends T
        ? 'text'
        : { readonly oneOf: readonly T[] }
      : [T] extends [string | null]
        ? 'text-or-null'
        : never;

type FieldsOf<D> = {
  readonly [K in keyof D]-?: undefined extends D[K]
    ? { readonly oneOf: readonly Exclude<D[K], undefined>[]; readonly optional: true }
    : RuleOf<D[K]>;
};

export interface EventSpec<D> {
  readonly about: string; // что случилось — для документации блока 14
  readonly fields: FieldsOf<D>;
}

export const ERROR_CODES = [
  'out-of-stock',
  'limit',
  'unauthorized',
  'network',
  'server',
  'invalid',
  'refused',
] as const satisfies readonly ErrorCode[];

const LINE = { lineId: 'text', productId: 'text', variantId: 'text-or-null', quantity: 'count' } as const;

export const EVENT_CATALOG = {
  'merfy:page:ready': { about: 'все секции страницы запущены', fields: {} },
  'merfy:page:view': { about: 'просмотр страницы', fields: { path: 'text' } },
  'merfy:page:hidden': { about: 'вкладку скрыли', fields: {} },
  'merfy:page:visible': { about: 'вкладку вернули', fields: {} },
  'merfy:page:restore': { about: '«Назад»: браузер достал страницу из кеша', fields: {} },
  'merfy:page:leave': { about: 'уход со страницы', fields: {} },
  'merfy:cart:add': {
    about: 'товар добавлен в корзину — после ответа сервера; quantity — сколько добавилось, price — за штуку',
    fields: { ...LINE, price: 'money' },
  },
  'merfy:cart:remove': { about: 'строка убрана из корзины', fields: LINE },
  'merfy:cart:change': {
    about: 'покупатель поменял количество в корзине',
    fields: { ...LINE, previousQuantity: 'count' },
  },
  'merfy:cart:open': { about: 'покупатель открыл выезжающую корзину (cart.open при «Сайдбар»)', fields: {} },
  'merfy:variant:change': { about: 'выбран вариант товара', fields: { productId: 'text', variantId: 'text' } },
  'merfy:favorites:add': { about: 'товар отмечен в избранном', fields: { productId: 'text' } },
  'merfy:favorites:remove': { about: 'отметка избранного снята', fields: { productId: 'text' } },
  'merfy:auth:signin': { about: 'покупатель вошёл', fields: {} },
  'merfy:auth:signout': { about: 'покупатель вышел', fields: {} },
  'merfy:search:submit': { about: 'отправлен поиск', fields: { query: 'text' } },
  'merfy:search:open': { about: 'покупатель открыл панель поиска (search.open)', fields: {} },
  'merfy:catalog:page': { about: 'каталог показал следующую страницу', fields: { page: 'count' } },
  'merfy:section:mount': { about: 'секция запущена', fields: { section: 'text' } },
  'merfy:section:error': {
    about: 'сбой секции',
    fields: {
      section: 'text',
      id: 'text',
      script: 'text',
      stage: { oneOf: ['mount', 'runtime', 'unmount'] },
      message: 'text',
    },
  },
  'merfy:block:select': { about: 'превью: мерчант выбрал блок секции в панели слева', fields: { blockId: 'text' } },
  'merfy:block:deselect': { about: 'превью: выбор блока секции снят', fields: { blockId: 'text' } },
  'merfy:notice:show': {
    about: 'показать уведомление покупателю — его выводит секция «Уведомления»',
    fields: {
      level: { oneOf: ['error', 'warning'] },
      message: 'text',
      code: { oneOf: ERROR_CODES, optional: true },
    },
  },
  'merfy:consent:change': { about: 'выбор в баннере cookie', fields: { state: { oneOf: ['accepted', 'declined'] } } },
} as const satisfies { readonly [E in EventName]: EventSpec<EventMap[E]> };

export const EVENT_NAMES: readonly string[] = Object.keys(EVENT_CATALOG);

export const isEventName = (name: string): name is EventName => Object.hasOwn(EVENT_CATALOG, name);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCount = (value: unknown): boolean => Number.isInteger(value) && Number(value) >= 0;

const isMoney = (value: unknown): boolean =>
  isRecord(value) &&
  Object.keys(value).length === 2 &&
  isCount(value.amount) &&
  typeof value.currency === 'string' &&
  value.currency !== '';

const NAMED_RULES: Readonly<Record<Exclude<FieldRule, object>, (value: unknown) => boolean>> = {
  text: (value) => typeof value === 'string',
  'text-or-null': (value) => value === null || typeof value === 'string',
  count: isCount,
  money: isMoney,
};

const RULE_TEXT: Readonly<Record<Exclude<FieldRule, object>, string>> = {
  text: 'строка',
  'text-or-null': 'строка или null',
  count: 'целое число от 0',
  money: '{ amount: копейки целым числом, currency }',
};

// Проблема одного поля или null.
function fieldProblem(field: string, rule: FieldRule, detail: Record<string, unknown>): string | null {
  const present = Object.hasOwn(detail, field);
  if (typeof rule === 'string')
    return present && NAMED_RULES[rule](detail[field]) ? null : `${field} — ${RULE_TEXT[rule]}`;
  if (!present) return rule.optional === true ? null : `нет поля ${field}`;
  const value = detail[field];
  return typeof value === 'string' && rule.oneOf.includes(value)
    ? null
    : `${field} — одно из: ${rule.oneOf.join(', ')}`;
}

// Данные события по каталогу: текст первой проблемы или null. Лишнее поле — проблема: данные событий минимальные.
export function checkEventDetail(name: string, detail: unknown): string | null {
  if (!isEventName(name)) return `события ${name} нет в каталоге`;
  if (!isRecord(detail)) return `${name}: данные — объект`;
  const fields: Readonly<Record<string, FieldRule>> = EVENT_CATALOG[name].fields;
  const extra = Object.keys(detail).find((field) => !Object.hasOwn(fields, field));
  if (extra !== undefined) return `${name}: лишнее поле ${extra}`;

  const problems = Object.entries(fields).map(([field, rule]) => fieldProblem(field, rule, detail));
  const first = problems.find((problem) => problem !== null);
  return first === undefined ? null : `${name}: ${first}`;
}

export const isEventDetail = <E extends EventName>(name: E, detail: unknown): detail is EventDetail<E> =>
  checkEventDetail(name, detail) === null;

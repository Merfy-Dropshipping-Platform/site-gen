import { z } from 'zod';
import { StorefrontConfigError, type StorefrontConfigErrorCode } from './errors';

// Схема конфига витрины v1 (design.md блока 3, 5.2) — единственное место правил. Строгая на всех уровнях:
// незнакомый ключ — ошибка. Тип StorefrontConfig выводится из неё, JSON Schema пишет команда generate.

export const CONFIG_VERSION = 1;
export const MODES = ['live', 'preview'] as const;
// Одинаково для всех магазинов v1 (К3-1 А). Другая валюта или язык — новое поле, а не v2.
export const CURRENCY = 'RUB';
export const LOCALE = 'ru-RU';

// id и версия — по тем же правилам, что у манифеста темы (packages/theme-contract/validators/ThemeManifestSchema.ts).
const KEBAB_ID = /^[a-z0-9-]+$/;
const SEMVER = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;
const SHOP_NAME_MAX = 200;
const API_SUFFIX = '/api';

const kebabId = z.string().regex(KEBAB_ID, { error: 'нужны строчные латинские буквы, цифры и дефис' });

// Счётчики мерчанта (design.md блока 11, С11-4 Б): известные виды по номеру. Номер вписывается в код счётчика — шаблон
// модуля аналитики, — поэтому правило номера строгое: только цифры, латиница и дефис, без кавычек и скобок. Тем же
// правилом сборщик витрин отбирает счётчики, которые берёт у сборщика аналитики.
export const COUNTER_KINDS = ['metrika', 'vk', 'google'] as const;
export type CounterKind = (typeof COUNTER_KINDS)[number];
export const COUNTER_NUMBERS: Readonly<Record<CounterKind, RegExp>> = {
  metrika: /^[1-9][0-9]{0,11}$/,
  vk: /^VK-RTRG-[0-9]{1,12}-[A-Za-z0-9]{1,32}$/,
  google: /^G-[A-Z0-9]{4,20}$/,
};

export const isCounterNumber = (kind: CounterKind, number: string): boolean => COUNTER_NUMBERS[kind].test(number);

const counterSchema = z
  .strictObject({ kind: z.enum(COUNTER_KINDS), number: z.string() })
  .refine((counter) => isCounterNumber(counter.kind, counter.number), {
    path: ['number'],
    error: 'номер не по правилу своего вида счётчика',
  });

// «Свой код» мерчанта (блок 13 «Секций и SDK», 13.4; В13-1 В): текст из кабинета как есть — ядро витрины выполняет из
// него только <script> (@merfy/shell, custom-code.ts). consent: required — после «Принять» в баннере cookie, none —
// сразу. Предел на магазин держит сборщик витрин. Нет кодов — поля нет.
const CUSTOM_CODE_CONSENTS = ['required', 'none'] as const;
const customCodeSchema = z.strictObject({ code: z.string().min(1), consent: z.enum(CUSTOM_CODE_CONSENTS) });

// Сборщик аналитики (блок 11, «решил сам» 4): события уходят на <url>/collect, поэтому адрес — без косой черты в конце.
const analyticsSchema = z.strictObject({
  url: z
    .url({ protocol: /^https?$/, error: 'нужен адрес http:// или https://' })
    .refine((url) => !url.endsWith('/'), { error: 'адрес сборщика — без косой черты в конце' }),
  counters: z.array(counterSchema),
  custom: z.array(customCodeSchema).min(1).optional(),
});

// Виды записей страницы (блок 8 «Секций и SDK», часть 8б-2) — как RECORD_TYPES сборки (storefront-build,
// records.ts): что каждый вид сборки здесь есть, проверяет typecheck сборки (configPageOf в head.ts).
export const RECORD_PAGE_TYPES = ['product', 'collection', 'blog', 'article', 'policy'] as const;
export type RecordPageType = (typeof RECORD_PAGE_TYPES)[number];

const configShape = z.strictObject({
  v: z.literal(CONFIG_VERSION),
  mode: z.enum(MODES),
  shop: z.strictObject({
    id: z.uuid(),
    name: z.string().min(1).max(SHOP_NAME_MAX),
    url: z.url({ protocol: /^https$/, error: 'нужен адрес https://…' }).nullable(),
  }),
  currency: z.literal(CURRENCY),
  locale: z.literal(LOCALE),
  api: z.strictObject({
    url: z
      .url({ protocol: /^https?$/, error: 'нужен адрес http:// или https://' })
      .endsWith(API_SUFFIX, { error: 'адрес API должен кончаться на /api' }),
  }),
  theme: z.strictObject({
    id: kebabId,
    version: z.string().regex(SEMVER, { error: 'нужна версия semver: 1.2.3' }),
  }),
  // Страница записи (часть 8б-2): вид и id записи — для аналитики товара (блок 13) и сторов расширений; у главной,
  // своих страниц и 404 ключа нет.
  page: z.strictObject({
    id: kebabId,
    path: z.string().startsWith('/'),
    record: z.strictObject({ type: z.enum(RECORD_PAGE_TYPES), id: z.string().min(1) }).optional(),
  }),
  // null — магазин ничего не отправляет: превью и стенд (design.md блока 11, «решил сам» 8).
  analytics: analyticsSchema.nullable(),
});

// У опубликованного магазина адрес обязателен: по нему строятся канонические адреса и ссылки.
const liveHasUrl = (config: z.infer<typeof configShape>): boolean => config.mode !== 'live' || config.shop.url !== null;

// Без адреса сборщика опубликованный магазин не собирается (design.md блока 11, И4): запасного адреса нет.
const liveHasAnalytics = (config: z.infer<typeof configShape>): boolean =>
  config.mode !== 'live' || config.analytics !== null;

export const storefrontConfigSchema = configShape
  .refine(liveHasUrl, { path: ['shop', 'url'], error: 'у опубликованного магазина нужен адрес' })
  .refine(liveHasAnalytics, {
    path: ['analytics'],
    error: 'у опубликованного магазина нужен адрес сборщика аналитики',
  });

export type StorefrontConfig = z.infer<typeof storefrontConfigSchema>;
export type Counter = z.infer<typeof counterSchema>;
export type AnalyticsConfig = z.infer<typeof analyticsSchema>;
export type CustomCode = z.infer<typeof customCodeSchema>;

// Тексты zod — по-русски, без глобальной настройки: пакет не меняет zod для соседей.
const RUSSIAN_ERRORS = { error: z.locales.ru().localeError };

// Путь проблемы. У лишнего ключа zod называет объект, где он лежит, — добавляем сам ключ: путь ведёт к полю.
function issuePath(issue: z.core.$ZodIssue): string | undefined {
  const keys = issue.code === 'unrecognized_keys' ? issue.keys.slice(0, 1) : [];
  const path = [...issue.path.map(String), ...keys].join('.');
  return path === '' ? undefined : path;
}

// Проверка схемой. Не прошло — StorefrontConfigError с первой проблемой: код, путь поля и текст по-русски.
export function parseWith<T>(schema: z.ZodType<T>, value: unknown, code: StorefrontConfigErrorCode): T {
  const result = schema.safeParse(value, RUSSIAN_ERRORS);
  if (result.success) return result.data;
  const [issue] = result.error.issues;
  throw new StorefrontConfigError(code, issue.message, { path: issuePath(issue) });
}

export const checkStorefrontConfig = (value: unknown): StorefrontConfig =>
  parseWith(storefrontConfigSchema, value, 'config-invalid');

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
  page: z.strictObject({ id: kebabId, path: z.string().startsWith('/') }),
});

// У опубликованного магазина адрес обязателен: по нему строятся канонические адреса и ссылки.
const liveHasUrl = (config: z.infer<typeof configShape>): boolean => config.mode !== 'live' || config.shop.url !== null;

export const storefrontConfigSchema = configShape.refine(liveHasUrl, {
  path: ['shop', 'url'],
  error: 'у опубликованного магазина нужен адрес',
});

export type StorefrontConfig = z.infer<typeof storefrontConfigSchema>;

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

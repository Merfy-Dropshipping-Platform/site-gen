import { StorefrontConfigError, type StorefrontConfigErrorCode } from './errors';
import type { StorefrontConfig } from './schema';
import { CONFIG_TAG_ID } from './tag';

// Читатель конфига в браузере (design.md блока 3, 5.5). Без zod: полную схему проверил писатель при сборке, здесь —
// версия формы, обязательные поля и их типы. Значения связаны со схемой типами: поменяется схема — здесь будет
// ошибка типов, а не тихое расхождение.
const KNOWN_VERSION: StorefrontConfig['v'] = 1;
const MODES: Record<StorefrontConfig['mode'], true> = { live: true, preview: true };
const CURRENCY: StorefrontConfig['currency'] = 'RUB';
const LOCALE: StorefrontConfig['locale'] = 'ru-RU';

// Где искать тег: обычно document; тесту хватает любого объекта с getElementById.
export type ConfigSource = { getElementById(id: string): { textContent: string | null } | null };

type FieldCheck = { path: string; code: StorefrontConfigErrorCode; problem: string; test: (value: unknown) => boolean };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): boolean => typeof value === 'string' && value !== '';
const isTextOrNull = (value: unknown): boolean => value === null || isText(value);
const isMode = (value: unknown): boolean => typeof value === 'string' && Object.hasOwn(MODES, value);

const NEED_TEXT = 'нужна непустая строка';

// Проверки по порядку схемы. Первая не прошедшая называет поле в ошибке.
const FIELD_CHECKS: readonly FieldCheck[] = [
  {
    path: 'v',
    code: 'config-version',
    problem: `читатель знает только версию ${KNOWN_VERSION}`,
    test: (value) => value === KNOWN_VERSION,
  },
  { path: 'mode', code: 'config-invalid', problem: 'нужно live или preview', test: isMode },
  { path: 'shop.id', code: 'config-invalid', problem: NEED_TEXT, test: isText },
  { path: 'shop.name', code: 'config-invalid', problem: NEED_TEXT, test: isText },
  { path: 'shop.url', code: 'config-invalid', problem: `${NEED_TEXT} или null`, test: isTextOrNull },
  { path: 'currency', code: 'config-invalid', problem: `нужно ${CURRENCY}`, test: (value) => value === CURRENCY },
  { path: 'locale', code: 'config-invalid', problem: `нужно ${LOCALE}`, test: (value) => value === LOCALE },
  { path: 'api.url', code: 'config-invalid', problem: NEED_TEXT, test: isText },
  { path: 'theme.id', code: 'config-invalid', problem: NEED_TEXT, test: isText },
  { path: 'theme.version', code: 'config-invalid', problem: NEED_TEXT, test: isText },
  { path: 'page.id', code: 'config-invalid', problem: NEED_TEXT, test: isText },
  { path: 'page.path', code: 'config-invalid', problem: NEED_TEXT, test: isText },
];

function valueAt(root: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => (isRecord(value) ? value[key] : undefined), root);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new StorefrontConfigError('config-invalid', 'в теге не JSON', { cause: error });
  }
}

// Тип сужается только здесь — когда прошли все проверки таблицы.
function assertStorefrontConfig(value: unknown): asserts value is StorefrontConfig {
  const failed = FIELD_CHECKS.find((check) => !check.test(valueAt(value, check.path)));
  if (failed !== undefined) throw new StorefrontConfigError(failed.code, failed.problem, { path: failed.path });
}

export function parseStorefrontConfig(text: string): StorefrontConfig {
  const value = parseJson(text);
  assertStorefrontConfig(value);
  return value;
}

// Что делать при ошибке, решает вызывающий: стенд показывает текст в своём разделе, каркас решит в блоке 7.
export function readStorefrontConfig(doc: ConfigSource = document): StorefrontConfig {
  const tag = doc.getElementById(CONFIG_TAG_ID);
  if (tag === null) throw new StorefrontConfigError('config-missing', `на странице нет тега #${CONFIG_TAG_ID}`);
  return parseStorefrontConfig(tag.textContent ?? '');
}

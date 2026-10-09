import { z } from 'zod';
import { StorefrontBuilderError, type StorefrontBuilderErrorCode } from './errors';

// Тексты zod — по-русски, без глобальной настройки: пакет не меняет zod для соседей (как у блоков 3–5).
const RUSSIAN_ERRORS = { error: z.locales.ru().localeError };

// Путь проблемы: где лежит значение (prefix — что проверяем) и путь поля внутри.
function issuePath(prefix: string, issue: z.core.$ZodIssue): string {
  const keys = issue.code === 'unrecognized_keys' ? issue.keys.slice(0, 1) : [];
  const path = [...issue.path.map(String), ...keys].join('.');
  return path === '' ? prefix : `${prefix}#${path}`;
}

// Проверка схемой внешних данных: строки базы, сообщения брокера, ответы сервисов, окружение. Не прошло —
// StorefrontBuilderError с кодом, путём поля и текстом первой проблемы.
export function parseWith<T>(schema: z.ZodType<T>, value: unknown, code: StorefrontBuilderErrorCode, what: string): T {
  const result = schema.safeParse(value, RUSSIAN_ERRORS);
  if (result.success) return result.data;
  const [issue] = result.error.issues;
  throw new StorefrontBuilderError(code, issue.message, { path: issuePath(what, issue) });
}

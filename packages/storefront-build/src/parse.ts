import { z } from 'zod';
import { StorefrontBuildError, type StorefrontBuildErrorCode } from './errors';

// Тексты zod — по-русски, без глобальной настройки: пакет не меняет zod для соседей (как у блока 3).
const RUSSIAN_ERRORS = { error: z.locales.ru().localeError };

// Путь проблемы. У лишнего ключа zod называет объект, где он лежит, — добавляем сам ключ: путь ведёт к полю.
function issuePath(issue: z.core.$ZodIssue): string | undefined {
  const keys = issue.code === 'unrecognized_keys' ? issue.keys.slice(0, 1) : [];
  const path = [...issue.path.map(String), ...keys].join('.');
  return path === '' ? undefined : path;
}

// Проверка схемой. Не прошло — StorefrontBuildError с первой проблемой: код, путь поля и текст по-русски.
export function parseWith<T>(schema: z.ZodType<T>, value: unknown, code: StorefrontBuildErrorCode): T {
  const result = schema.safeParse(value, RUSSIAN_ERRORS);
  if (result.success) return result.data;
  const [issue] = result.error.issues;
  throw new StorefrontBuildError(code, issue.message, { path: issuePath(issue) });
}

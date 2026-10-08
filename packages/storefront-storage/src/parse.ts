import { z } from 'zod';
import { StorefrontStorageError } from './errors';

// Тексты zod — по-русски, без глобальной настройки: пакет не меняет zod для соседей (как у блоков 3 и 4).
const RUSSIAN_ERRORS = { error: z.locales.ru().localeError };

// Путь проблемы внутри объекта. У лишнего ключа zod называет объект, где он лежит, — добавляем сам ключ.
function issuePath(issue: z.core.$ZodIssue): string {
  const keys = issue.code === 'unrecognized_keys' ? issue.keys.slice(0, 1) : [];
  return [...issue.path.map(String), ...keys].join('.');
}

// Проверка схемой. Не прошло — object-invalid: путь — ключ объекта и поле, текст по-русски.
export function parseWith<T>(schema: z.ZodType<T>, value: unknown, objectKey: string): T {
  const result = schema.safeParse(value, RUSSIAN_ERRORS);
  if (result.success) return result.data;
  const [issue] = result.error.issues;
  const field = issuePath(issue);
  const path = field === '' ? objectKey : `${objectKey}#${field}`;
  throw new StorefrontStorageError('object-invalid', issue.message, { path });
}

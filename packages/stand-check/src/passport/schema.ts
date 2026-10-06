import { z } from 'zod';

const GLOBAL_NAME = /^__MERFY_\w+__$/;
const STORAGE_KEY = /^(local|session):.+$/;

// Проверка, а не глотание ошибки: невалидный JSON — ответ «нет», и схема назовёт поле.
function isJsonText(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

export const scriptEntrySchema = z
  .object({
    src: z.string().min(1),
    kind: z.enum(['external', 'inline', 'module', 'json']),
    bytes: z.number().int().nonnegative(),
    hash: z.string().min(1).optional(),
  })
  .strict();

export const requestEntrySchema = z
  .object({
    url: z.string().min(1),
    status: z.number().int().min(0).max(599),
  })
  .strict();

// Паспорт страницы (design.md 5.3). Хранилище — только ключи «local:…» и «session:…», без значений.
export const passportSchema = z
  .object({
    version: z.literal(1),
    page: z.string().startsWith('/'),
    target: z.enum(['local', 'dev']),
    scripts: z.array(scriptEntrySchema),
    globals: z.record(z.string().regex(GLOBAL_NAME), z.string().refine(isJsonText, 'нужен текст JSON')),
    storage: z.array(z.string().regex(STORAGE_KEY)),
    cookies: z.array(z.string().min(1)),
    requests: z.array(requestEntrySchema),
    errors: z.array(z.string()),
    tokens: z.record(z.string().startsWith('--'), z.string()),
    fonts: z.array(z.string().min(1)),
  })
  .strict();

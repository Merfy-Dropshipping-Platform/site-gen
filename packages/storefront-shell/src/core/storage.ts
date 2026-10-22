import { ShellError } from '../errors';
import { deepFreeze } from './freeze';
import type { Json, Mode, SectionStorage } from './types';

// Хранилище секции в браузере покупательницы (design.md блока 5, раздел 3.2): ключ merfy:s:<имя секции>:<ключ>, на
// секцию — не больше STORAGE_LIMIT байт JSON. В превью и без localStorage — память страницы: превью не пишет в браузер
// мерчанта, а рамка без allow-same-origin хранилища не видит.

export const STORAGE_PREFIX = 'merfy:s:';
export const STORAGE_LIMIT = 4096;
export type KeyValue = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

// Память страницы вместо localStorage: те же операции, своя реализация на Map.
const memoryStorage = (): KeyValue => {
  const values = new Map<string, string>();
  return {
    get length(): number {
      return values.size;
    },
    key(index: number): string | null {
      return [...values.keys()][index] ?? null;
    },
    getItem(key: string): string | null {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      values.set(key, value);
    },
    removeItem(key: string): void {
      values.delete(key);
    },
  };
};

// Решение о хранилище страницы: превью — память; витрина — localStorage, а если он недоступен (запрет браузера, рамка
// с песочницей) — память. Запасной ход sanctioned разделом 3.2: false от set, а не сбой секции.
export function pageStorage(win: Pick<Window, 'localStorage'>, mode: Mode): KeyValue {
  if (mode === 'preview') return memoryStorage();
  try {
    return win.localStorage;
  } catch {
    return memoryStorage();
  }
}

const KEY_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const checkKey = (key: string): string => {
  if (!KEY_CASE.test(key)) throw new ShellError('sdk-call-invalid', `ключ «${key}» хранилища — kebab-case`);
  return key;
};

const fullKeyOf = (section: string, key: string): string => `${STORAGE_PREFIX}${section}:${key}`;

// Сколько байт JSON уже занимает секция: без ключа, который сейчас заменяют.
const usedBytes = (page: KeyValue, section: string, without: string): number => {
  const prefix = `${STORAGE_PREFIX}${section}:`;
  let total = 0;
  for (let i = 0; i < page.length; i += 1) {
    const key = page.key(i);
    if (key === null || !key.startsWith(prefix) || key === `${prefix}${without}`) continue;
    total += (page.getItem(key) ?? '').length;
  }
  return total;
};

// Значение из хранилища — внешний текст: разбор и проверка, что вышел JSON, потом заморозка.
const isRecord = (value: unknown): value is Record<string, Json> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isJsonValue = (value: unknown): value is Json =>
  value === null ||
  typeof value === 'boolean' ||
  typeof value === 'number' ||
  typeof value === 'string' ||
  (Array.isArray(value) && value.every(isJsonValue)) ||
  (isRecord(value) && Object.values(value).every(isJsonValue));

export function createSectionStorage(section: string, page: KeyValue): SectionStorage {
  return {
    get(key: string): Json | undefined {
      const raw = page.getItem(fullKeyOf(section, checkKey(key)));
      if (raw === null) return undefined;
      const parsed: unknown = JSON.parse(raw);
      return isJsonValue(parsed) ? deepFreeze(parsed) : undefined;
    },
    set(key: string, value: Json): boolean {
      const full = fullKeyOf(section, checkKey(key));
      const next = JSON.stringify(value);
      if (usedBytes(page, section, key) + next.length > STORAGE_LIMIT) return false;
      try {
        page.setItem(full, next);
      } catch {
        return false; // хранилище переполнено или закрыто для записи — об этом говорит false
      }
      return true;
    },
    remove(key: string): void {
      page.removeItem(fullKeyOf(section, checkKey(key)));
    },
  };
}

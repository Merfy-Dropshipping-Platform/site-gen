/**
 * JSON-примитивы движка. `undefined` в объекте = поля нет: документ бывает
 * собран в памяти (`{ ...rev, currentPageId: undefined }`), а в jsonb такое
 * поле не доезжает.
 */

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Ключи объекта со значением (без `undefined`). */
export function definedKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).filter((k) => value[k] !== undefined);
}

function arraysEqual(a: unknown[], b: unknown[]): boolean {
  return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
}

function objectsEqual(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  const keys = definedKeys(a);
  if (keys.length !== definedKeys(b).length) return false;
  return keys.every((k) => deepEqual(a[k], b[k]));
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return arraysEqual(a, b);
  if (isPlainObject(a) && isPlainObject(b)) return objectsEqual(a, b);
  return false;
}

export function cloneJson<T>(value: T): T {
  return value === undefined ? value : structuredClone(value);
}

/** Значение для ответа API и `meta`: отсутствие — `null`. */
export function orNull(value: unknown): unknown {
  return value === undefined ? null : value;
}

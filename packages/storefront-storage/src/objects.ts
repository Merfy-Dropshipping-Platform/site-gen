import { StorefrontStorageError } from './errors';
import type { ObjectStore, WriteCondition } from './store';

// JSON-объекты хранилища: указатель, манифесты, таблицы раздачи, списки. Прочитал — сразу проверил схемой. Объекты,
// которые меняются (указатель, списки), пишутся только через updateObject: прочитал → решил → записал, если объект не
// менялся с чтения; кто-то успел раньше — читаем и решаем заново (design.md блока 5, В5-2 Б).

export const JSON_TYPE = 'application/json';
// Попыток условной записи. Указатель магазина пишут сборщик и служебные команды — гонка редкая; в пробе (задача 2)
// 8 писателей по 25 правок уложились в 286 попыток на 200 правок.
export const UPDATE_ATTEMPTS = 20;

export type Parse<T> = (value: unknown, key: string) => T;

export interface Versioned<T> {
  value: T;
  etag: string;
}

// Решение по текущему значению: outcome — что получилось, next — что записать; null — уже в нужном состоянии, не
// пишем. Так повтор записи, который вернул отказ, хотя первая попытка записала (задача 2), — тоже успех.
export interface Decision<T, O> {
  outcome: O;
  next: T | null;
}

export interface Updated<T, O> {
  outcome: O;
  value: T | null;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const jsonBytes = (value: unknown): Uint8Array => encoder.encode(JSON.stringify(value));

function parseJson(body: Uint8Array, key: string): unknown {
  try {
    return JSON.parse(decoder.decode(body));
  } catch (error) {
    throw new StorefrontStorageError('object-invalid', 'не JSON', { path: key, cause: error });
  }
}

export async function readObject<T>(store: ObjectStore, key: string, parse: Parse<T>): Promise<Versioned<T> | null> {
  const stored = await store.read(key);
  if (stored === null) return null;
  return { value: parse(parseJson(stored.body, key), key), etag: stored.etag };
}

// Запись без условия — для того, что не меняется после записи: манифест и таблица раздачи сборки.
export async function writeObject(store: ObjectStore, key: string, value: unknown): Promise<void> {
  await store.write(key, jsonBytes(value), { contentType: JSON_TYPE });
}

const conditionOf = (current: Versioned<unknown> | null): WriteCondition =>
  current === null ? { ifNoneMatch: '*' } : { ifMatch: current.etag };

export async function updateObject<T, O>(
  store: ObjectStore,
  key: string,
  parse: Parse<T>,
  decide: (current: T | null) => Decision<T, O>,
): Promise<Updated<T, O>> {
  for (let attempt = 1; attempt <= UPDATE_ATTEMPTS; attempt += 1) {
    const current = await readObject(store, key, parse);
    const { outcome, next } = decide(current?.value ?? null);
    if (next === null) return { outcome, value: current?.value ?? null };
    const options = { contentType: JSON_TYPE, condition: conditionOf(current) };
    if ((await store.write(key, jsonBytes(next), options)).written) return { outcome, value: next };
  }
  throw new StorefrontStorageError('update-conflict', `не записан за ${UPDATE_ATTEMPTS} попыток`, { path: key });
}

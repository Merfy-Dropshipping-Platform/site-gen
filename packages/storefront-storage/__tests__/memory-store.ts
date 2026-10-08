import { createHash } from 'node:crypto';
import type { ListedObject, ObjectStore, StoredObject, WriteCondition, WriteOptions, WriteResult } from '../src/store';

// Хранилище в памяти для быстрых тестов. Условная запись и отпечаток — как у S3 (одни проверки с MinIO —
// store-contract.ts): отпечаток — MD5 содержимого, те же байты дают тот же отпечаток. Время записи — из часов теста.
// objects — что лежит и с каким типом, writes — ключи по порядку записи: тесты смотрят прямо в них.

export interface MemoryEntry {
  body: Uint8Array;
  etag: string;
  contentType: string;
  modifiedAt: string;
}

export type MemoryStore = ObjectStore & { objects: Map<string, MemoryEntry>; writes: string[] };

const DEFAULT_TIME = '2026-10-07T00:00:00.000Z';

function conditionHolds(entry: MemoryEntry | undefined, condition: WriteCondition | undefined): boolean {
  if (condition === undefined) return true;
  if ('ifMatch' in condition) return entry?.etag === condition.ifMatch;
  return entry === undefined;
}

export function createMemoryStore(clock: () => string = () => DEFAULT_TIME): MemoryStore {
  const objects = new Map<string, MemoryEntry>();
  const writes: string[] = [];
  const read = (key: string): Promise<StoredObject | null> => {
    const entry = objects.get(key);
    return Promise.resolve(entry === undefined ? null : { body: entry.body, etag: entry.etag });
  };
  const write = (key: string, body: Uint8Array, options: WriteOptions): Promise<WriteResult> => {
    if (!conditionHolds(objects.get(key), options.condition)) return Promise.resolve({ written: false });
    const etag = `"${createHash('md5').update(body).digest('hex')}"`;
    objects.set(key, { body, etag, contentType: options.contentType, modifiedAt: clock() });
    writes.push(key);
    return Promise.resolve({ written: true, etag });
  };
  const list = (prefix: string): Promise<ListedObject[]> => {
    const keys = [...objects.keys()].filter((key) => key.startsWith(prefix)).sort();
    return Promise.resolve(keys.map((key) => ({ key, modifiedAt: objects.get(key)?.modifiedAt ?? DEFAULT_TIME })));
  };
  const remove = (keys: readonly string[]): Promise<void> => {
    keys.forEach((key) => objects.delete(key));
    return Promise.resolve();
  };
  return { read, write, list, remove, has: (key) => Promise.resolve(objects.has(key)), objects, writes };
}

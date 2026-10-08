// Хранилище объектов, как его видит пакет (design.md блока 5): чтение с отпечатком версии (ETag), проверка наличия,
// запись с условием — «только если объект не менялся» (If-Match) или «только если его нет» (If-None-Match: *),
// список по префиксу и удаление. Настоящее — S3 в MinIO (s3-store.ts), в быстрых тестах — память.

export interface StoredObject {
  body: Uint8Array;
  etag: string;
}

export interface ListedObject {
  key: string;
  // Время последней записи, ISO UTC: по нему уборка не трогает свежее (раздел 4, «Хранение и уборка»).
  modifiedAt: string;
}

export type WriteCondition = { ifMatch: string } | { ifNoneMatch: '*' };

export interface WriteOptions {
  contentType: string;
  condition?: WriteCondition;
}

// Условие не выполнено — не ошибка, а ответ: кто-то записал раньше, читай заново.
export type WriteResult = { written: true; etag: string } | { written: false };

export interface ObjectStore {
  read(key: string): Promise<StoredObject | null>;
  has(key: string): Promise<boolean>;
  write(key: string, body: Uint8Array, options: WriteOptions): Promise<WriteResult>;
  list(prefix: string): Promise<ListedObject[]>;
  remove(keys: readonly string[]): Promise<void>;
}

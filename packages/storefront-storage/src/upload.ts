import { sha256, type BuildFile, type StorefrontManifest } from '@merfy/storefront-build';
import { contentTypeOf } from './content-types';
import { blobKey } from './layout';
import type { ObjectStore } from './store';

// Заливка только нового (design.md блока 5, раздел 4, «Хранение и уборка»): отпечатки манифеста сверяем с манифестом
// прошлой живой сборки — эти файлы уже лежат и не льются. Остальное сборщик (блок 6) отдаёт содержимым — это
// перерисованные файлы, их льём. Файл ложится под отпечатком своего содержимого, поэтому повторная заливка безвредна:
// то же имя, те же байты. Льём, даже если такой файл уже лежит: свежая дата записи не даёт уборке (cleanup.ts) убрать
// его, пока таблица новой сборки ещё не записана, — файлы старше суток, на которые ничего не ссылается, она удаляет.
// У хранилища спрашиваем только то, чего нет ни в прошлой сборке, ни среди переданных.

// Сколько вопросов «файл есть?» и записей идут одновременно.
export const UPLOAD_CONCURRENCY = 16;

export interface UploadReport {
  // Разных файлов в сборке, залито сейчас и каких нет ни в хранилище, ни среди переданных (отпечатки sha256:…).
  total: number;
  uploaded: number;
  missing: string[];
}

async function inBatches<T, R>(items: readonly T[], action: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let start = 0; start < items.length; start += UPLOAD_CONCURRENCY) {
    const batch = items.slice(start, start + UPLOAD_CONCURRENCY);
    results.push(...(await Promise.all(batch.map(action))));
  }
  return results;
}

async function writeBlob(store: ObjectStore, file: BuildFile): Promise<void> {
  await store.write(blobKey(sha256(file.content)), file.content, { contentType: contentTypeOf(file.path) });
}

// Файлы по отпечатку содержимого; так же льются robots.txt и карта сайта — их нет в манифесте.
export async function uploadFiles(store: ObjectStore, files: readonly BuildFile[]): Promise<void> {
  await inBatches(files, (file) => writeBlob(store, file));
}

export async function uploadBuild(
  store: ObjectStore,
  manifest: StorefrontManifest,
  files: readonly BuildFile[],
  previous: StorefrontManifest | null,
): Promise<UploadReport> {
  const wanted = [...new Set(Object.values(manifest.files))];
  const known = new Set(Object.values(previous?.files ?? {}));
  const provided = new Map(files.map((file) => [sha256(file.content), file]));
  const unknown = wanted.filter((hash) => !known.has(hash));
  const uploads = unknown.flatMap((hash) => provided.get(hash) ?? []);
  const unprovided = unknown.filter((hash) => !provided.has(hash));
  const present = await inBatches(unprovided, (hash) => store.has(blobKey(hash)));
  await uploadFiles(store, uploads);
  return {
    total: wanted.length,
    uploaded: uploads.length,
    missing: unprovided.filter((hash, index) => !present[index]),
  };
}

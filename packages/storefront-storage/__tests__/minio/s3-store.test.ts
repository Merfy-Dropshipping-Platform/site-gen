import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { LOCAL_MINIO, ensureBucket } from '../../scripts/local-minio';
import { StorefrontStorageError } from '../../src/errors';
import { createS3Store } from '../../src/s3-store';
import { bytes, describeStoreContract } from '../store-contract';

// Нужен MinIO из compose.minio.yml: `pnpm minio:up`. Каждый тест пишет под своим префиксом.
beforeAll(() => ensureBucket(LOCAL_MINIO));

describeStoreContract('MinIO', () => ({ store: createS3Store(LOCAL_MINIO), prefix: `test-${randomUUID()}/` }));

describe('MinIO: хранилище не отвечает', () => {
  // Порт, где никого нет: каждый метод отдаёт store-failed с ключом в тексте.
  const store = createS3Store({ ...LOCAL_MINIO, endpoint: 'http://127.0.0.1:9' });
  const JSON_TYPE = { contentType: 'application/json' };

  it.each([
    ['read', () => store.read('k')],
    ['has', () => store.has('k')],
    ['write', () => store.write('k', bytes('1'), JSON_TYPE)],
    ['list', () => store.list('k')],
    ['remove', () => store.remove(['k'])],
  ])('%s — store-failed', async (name, action) => {
    const error: unknown = await action().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(StorefrontStorageError);
    expect(error instanceof StorefrontStorageError ? [error.code, error.path] : []).toEqual(['store-failed', 'k']);
  });
});

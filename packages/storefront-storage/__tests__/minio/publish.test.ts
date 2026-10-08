import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { LOCAL_MINIO, ensureBucket } from '../../scripts/local-minio';
import { blobKey } from '../../src/layout';
import { changePointer, readPointer } from '../../src/pointer';
import { publishBuild } from '../../src/publish';
import { createS3Store } from '../../src/s3-store';
import { HOME, SCARF, buildOf } from '../manifests';

// Выкладка целиком на настоящем MinIO (`pnpm minio:up`): заливка, условная запись указателя, откат. Метка магазина —
// своя у каждого прогона.
beforeAll(() => ensureBucket(LOCAL_MINIO));

describe('MinIO: выкладка, правка, откат', () => {
  it('две выкладки и откат — указатель на прошлой сборке, на паузе', async () => {
    const store = createS3Store(LOCAL_MINIO);
    const label = `test-${randomUUID().slice(0, 8)}`;
    const base = { label, publicUrl: 'https://scarf.merfy.ru', indexable: false, now: '2026-10-07T12:00:00.000Z' };
    const first = buildOf([HOME, SCARF]);
    const second = buildOf([HOME, { ...SCARF, path: '/products/scarf-winter/' }]);
    const redrawn = second.files.filter((file) => file.path === 'products/scarf-winter/index.html');
    expect((await publishBuild(store, { ...base, build: 1, ...first })).status).toBe('live');
    const edit = await publishBuild(store, { ...base, build: 2, manifest: second.manifest, files: redrawn });
    expect(edit).toMatchObject({ status: 'live', upload: { total: 3 } });
    expect(await store.has(blobKey(second.manifest.files['products/scarf-winter/index.html']))).toBe(true);
    expect(await changePointer(store, label, { kind: 'rollback', from: 2 })).toMatchObject({ outcome: 'paused' });
    expect(await readPointer(store, label)).toMatchObject({ build: 1, newest: 2, paused: true, rev: 3 });
  });
});

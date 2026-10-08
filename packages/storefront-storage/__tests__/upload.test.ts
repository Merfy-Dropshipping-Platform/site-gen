import { sha256 } from '@merfy/storefront-build';
import { describe, expect, it } from 'vitest';
import { blobKey } from '../src/layout';
import type { ObjectStore } from '../src/store';
import { uploadBuild } from '../src/upload';
import { HOME, SCARF, STYLES, buildOf } from './manifests';
import { createMemoryStore } from './memory-store';

const SCARF_FILE = 'products/scarf/index.html';

// Хранилище, которое помнит, о каких ключах его спрашивали «есть?».
function counted(store: ObjectStore): ObjectStore & { asked: string[] } {
  const asked: string[] = [];
  const has = (key: string): Promise<boolean> => {
    asked.push(key);
    return store.has(key);
  };
  return { ...store, has, asked };
}

describe('заливка только нового', () => {
  it('первая выкладка: все файлы сборки — по отпечатку, тип — по пути', async () => {
    const store = createMemoryStore();
    const { manifest, files } = buildOf([HOME, SCARF]);
    expect(await uploadBuild(store, manifest, files, null)).toEqual({ total: 3, uploaded: 3, missing: [] });
    const keys = Object.values(manifest.files).map(blobKey).sort();
    expect([...store.objects.keys()].sort()).toEqual(keys);
    expect(store.objects.get(blobKey(manifest.files[STYLES]))?.contentType).toBe('text/css; charset=utf-8');
  });

  it('правка: файлы прошлой сборки не льёт и не спрашивает, льёт перерисованное', async () => {
    const store = counted(createMemoryStore());
    const first = buildOf([HOME, SCARF]);
    await uploadBuild(store, first.manifest, first.files, null);
    const second = buildOf([HOME, { ...SCARF, path: '/products/scarf-winter/' }]);
    const redrawn = second.files.filter((file) => file.path === 'products/scarf-winter/index.html');
    expect(await uploadBuild(store, second.manifest, redrawn, first.manifest)).toEqual({
      total: 3,
      uploaded: 1,
      missing: [],
    });
    expect(store.asked).toEqual([]);
  });

  it('файл уже лежит, но его нет в прошлой сборке, — льёт заново: свежая дата бережёт его от уборки', async () => {
    let now = '2026-10-01T00:00:00.000Z';
    const store = createMemoryStore(() => now);
    const { manifest, files } = buildOf([HOME]);
    await uploadBuild(store, manifest, files, null);
    now = '2026-10-07T00:00:00.000Z';
    expect(await uploadBuild(store, manifest, files, null)).toEqual({ total: 2, uploaded: 2, missing: [] });
    expect(store.objects.get(blobKey(manifest.files[STYLES]))?.modifiedAt).toBe(now);
  });

  it('файла нет среди переданных — спрашивает хранилище: нет и там — в missing', async () => {
    const store = counted(createMemoryStore());
    const { manifest, files } = buildOf([HOME, SCARF]);
    const withoutScarf = files.filter((file) => file.path !== SCARF_FILE);
    expect(await uploadBuild(store, manifest, withoutScarf, null)).toEqual({
      total: 3,
      uploaded: 2,
      missing: [manifest.files[SCARF_FILE]],
    });
    expect(store.asked).toEqual([blobKey(manifest.files[SCARF_FILE])]);
    await uploadBuild(store, manifest, files, null);
    expect((await uploadBuild(store, manifest, withoutScarf, null)).missing).toEqual([]);
  });

  it('переданный файл, которого нет в манифесте, не льёт', async () => {
    const store = createMemoryStore();
    const { manifest, files } = buildOf([HOME]);
    const extra = { path: 'stray.txt', content: new TextEncoder().encode('лишний') };
    await uploadBuild(store, manifest, [...files, extra], null);
    expect(store.objects.has(blobKey(sha256(extra.content)))).toBe(false);
  });
});

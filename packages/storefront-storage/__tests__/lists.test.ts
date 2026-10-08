import { describe, expect, it } from 'vitest';
import { parseDrawnList, parseEntityList } from '../src/formats';
import { blobKey, drawnKey, entitiesKey, hexOf } from '../src/layout';
import { addEntityPaths, recordDrawnPage, removeEntityPaths } from '../src/lists';
import { readObject } from '../src/objects';
import { HOME, SCARF, SHOP, UPDATED_AT, buildOf } from './manifests';
import { createMemoryStore } from './memory-store';
import { rejected } from './support';

// Страница шарфа, нарисованная по запросу: строка того же вида, что в манифесте, и её содержимое.
function drawnScarf() {
  const { manifest, files } = buildOf([HOME, SCARF]);
  const row = manifest.pages[1];
  const content = files.find((file) => file.path === row.file)?.content ?? new Uint8Array();
  return { row, content };
}

describe('список дорисовок', () => {
  it('файл — по отпечатку, строка — в список дорисовок живой сборки', async () => {
    const store = createMemoryStore();
    const { row, content } = drawnScarf();
    expect(await recordDrawnPage(store, { shop: SHOP, build: 41, row, content })).toBe('changed');
    expect(store.objects.has(blobKey(row.hash))).toBe(true);
    expect((await readObject(store, drawnKey(SHOP, 41), parseDrawnList))?.value).toEqual({
      v: 1,
      rows: {
        '/products/scarf/': { h: hexOf(row.hash), t: 'text/html; charset=utf-8', c: 'revalidate', m: UPDATED_AT },
      },
    });
  });

  it('та же страница ещё раз — список не переписывает', async () => {
    const store = createMemoryStore();
    const page = { shop: SHOP, build: 41, ...drawnScarf() };
    await recordDrawnPage(store, page);
    expect(await recordDrawnPage(store, page)).toBe('unchanged');
    expect(store.writes.filter((key) => key === drawnKey(SHOP, 41))).toHaveLength(1);
  });

  it('содержимое не совпадает с отпечатком строки — object-invalid, ничего не пишет', async () => {
    const store = createMemoryStore();
    const page = { shop: SHOP, build: 41, row: drawnScarf().row, content: new TextEncoder().encode('другое') };
    expect(await rejected(() => recordDrawnPage(store, page))).toMatchObject({
      code: 'object-invalid',
      path: '/products/scarf/',
    });
    expect(store.writes).toEqual([]);
  });
});

describe('список адресов сущностей', () => {
  it('дописать и убрать адреса; без изменений — без записи', async () => {
    const store = createMemoryStore();
    expect(await addEntityPaths(store, SHOP, ['/products/scarf/', '/products/osen/'])).toBe('changed');
    expect(await addEntityPaths(store, SHOP, ['/products/osen/'])).toBe('unchanged');
    expect(await removeEntityPaths(store, SHOP, ['/products/scarf/'])).toBe('changed');
    expect(await removeEntityPaths(store, SHOP, ['/products/none/'])).toBe('unchanged');
    expect((await readObject(store, entitiesKey(SHOP), parseEntityList))?.value).toEqual({
      v: 1,
      paths: ['/products/osen/'],
    });
    expect(store.writes).toHaveLength(2);
  });

  it('адрес не с / — object-invalid, список не записан', async () => {
    const store = createMemoryStore();
    expect(await rejected(() => addEntityPaths(store, SHOP, ['products/osen']))).toMatchObject({
      code: 'object-invalid',
      path: `${entitiesKey(SHOP)}#paths.0`,
    });
    expect(store.writes).toEqual([]);
  });
});

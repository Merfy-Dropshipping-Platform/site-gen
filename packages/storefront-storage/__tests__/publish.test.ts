import { describe, expect, it } from 'vitest';
import { parseRoutesTable, type RoutesTable } from '../src/formats';
import { manifestKey, pointerKey, routesKey } from '../src/layout';
import { readObject } from '../src/objects';
import { changePointer, readPointer } from '../src/pointer';
import { publishBuild, type PublishRequest } from '../src/publish';
import { HOME, SCARF, SHOP, buildOf, type PageSpec } from './manifests';
import { createMemoryStore } from './memory-store';
import { rejected } from './support';

const NOW = '2026-10-07T12:00:00.000Z';
const ABOUT = { path: '/about/', entity: HOME.entity };

function request(pages: PageSpec[], build: number, changes: Partial<PublishRequest> = {}): PublishRequest {
  const { manifest, files } = buildOf(pages);
  return {
    label: 'scarf',
    build,
    manifest,
    files,
    publicUrl: 'https://scarf.merfy.ru',
    indexable: false,
    now: NOW,
    ...changes,
  };
}

async function tableOf(store: ReturnType<typeof createMemoryStore>, build: number): Promise<RoutesTable | undefined> {
  return (await readObject(store, routesKey(SHOP, build), parseRoutesTable))?.value;
}

describe('выкладка сборки', () => {
  it('первая: файлы, манифест, таблица раздачи с robots.txt, указатель', async () => {
    const store = createMemoryStore();
    const result = await publishBuild(store, request([HOME, SCARF], 1));
    expect(result).toMatchObject({ status: 'live', problems: [], upload: { total: 3, uploaded: 3, missing: [] } });
    expect(result.pointer).toMatchObject({ shop: SHOP, build: 1, newest: 1 });
    expect(store.objects.has(manifestKey(SHOP, 1))).toBe(true);
    expect(Object.keys((await tableOf(store, 1))?.files ?? {})).toContain('/robots.txt');
    expect(store.writes.at(-1)).toBe(pointerKey('scarf'));
  });

  it('правка: льёт только перерисованное, прошлая сборка на месте, указатель — на новой', async () => {
    const store = createMemoryStore();
    await publishBuild(store, request([HOME, SCARF], 1));
    const second = buildOf([HOME, { ...SCARF, path: '/products/scarf-winter/' }]);
    const redrawn = second.files.filter((file) => file.path === 'products/scarf-winter/index.html');
    const result = await publishBuild(store, request([], 2, { manifest: second.manifest, files: redrawn }));
    expect(result).toMatchObject({
      status: 'live',
      upload: { total: 3, uploaded: 1 },
      pointer: { build: 2, history: [1] },
    });
    expect(store.objects.has(manifestKey(SHOP, 1))).toBe(true);
    expect((await tableOf(store, 2))?.moved).toEqual({ '/products/scarf/': '/products/scarf-winter/' });
  });

  it('та же сборка ещё раз — уже живая: ничего не льёт и не пишет', async () => {
    const store = createMemoryStore();
    await publishBuild(store, request([HOME], 1));
    const writes = store.writes.length;
    expect(await publishBuild(store, request([HOME], 1))).toMatchObject({ status: 'live', upload: null });
    expect(store.writes).toHaveLength(writes);
  });

  it('сборка без главной — указатель не тронут, правило home-page', async () => {
    const store = createMemoryStore();
    await publishBuild(store, request([HOME], 1));
    const result = await publishBuild(store, request([ABOUT], 2));
    expect(result).toMatchObject({ status: 'blocked', problems: [{ rule: 'home-page' }] });
    expect(await readPointer(store, 'scarf')).toMatchObject({ build: 1, newest: 1 });
    expect(store.objects.has(routesKey(SHOP, 2))).toBe(false);
  });

  it('товаров стало ноль — blocked; служебная команда разрешила — живая', async () => {
    const store = createMemoryStore();
    await publishBuild(store, request([HOME, SCARF], 1));
    expect((await publishBuild(store, request([HOME], 2))).status).toBe('blocked');
    expect((await publishBuild(store, request([HOME], 2, { allowed: ['products-not-gone'] }))).status).toBe('live');
    expect((await tableOf(store, 2))?.gone).toEqual({ '/products/scarf/': '2027-04-08T12:00:00.000Z' });
  });

  it('на паузе после отката — сборка ждёт снятия паузы; застрявшая старая — stale', async () => {
    const store = createMemoryStore();
    await publishBuild(store, request([HOME], 1));
    await publishBuild(store, request([HOME, SCARF], 2));
    await changePointer(store, 'scarf', { kind: 'rollback', from: 2 });
    expect(await publishBuild(store, request([HOME, SCARF], 3))).toMatchObject({
      status: 'paused',
      pointer: { build: 1, pending: 3 },
    });
    expect((await publishBuild(store, request([HOME, SCARF], 2))).status).toBe('stale');
  });

  it('магазин для поиска — карта сайта в таблице раздачи', async () => {
    const store = createMemoryStore();
    await publishBuild(store, request([HOME, SCARF], 1, { indexable: true }));
    const files = (await tableOf(store, 1))?.files ?? {};
    const seo = ['/robots.txt', '/sitemap.xml', '/sitemap-pages.xml', '/sitemap-products.xml'];
    expect(seo.filter((path) => !(path in files))).toEqual([]);
    expect(files['/sitemap.xml']).toMatchObject({ t: 'application/xml; charset=utf-8', c: 'revalidate' });
  });

  it('у живой сборки нет таблицы раздачи — build-incomplete', async () => {
    const store = createMemoryStore();
    await publishBuild(store, request([HOME], 1));
    store.objects.delete(routesKey(SHOP, 1));
    expect(await rejected(() => publishBuild(store, request([HOME], 2)))).toMatchObject({
      code: 'build-incomplete',
      path: routesKey(SHOP, 1),
    });
  });
});

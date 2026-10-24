import { entitiesKey, parseEntityList, type ObjectStore } from '@merfy/storefront-storage';
import { describe, expect, it } from 'vitest';
import { applyEntityPaths } from '../src/accept';
import type { IncomingEvent } from '../src/events';
import type { LogFields } from '../src/log';

// Адрес нового и удалённого товара (блок 8 «Секций и SDK», часть 8б-2, Р8б-16): до сборки — в список адресов
// магазина, по нему раздача отправляет адрес на рендер по запросу. Сбой хранилища событие не роняет.
const SITE = '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70';
const AT = '2026-10-20T10:00:00.000Z';
const CREATED: IncomingEvent = {
  owner: 'tenant',
  tenantId: SITE,
  type: 'product-change',
  eventAt: AT,
  paths: { add: ['/product/sharf'], remove: [] },
};
const DELETED: IncomingEvent = { ...CREATED, paths: { add: [], remove: ['/product/sharf', '/product/p-1'] } };
const EDITED: IncomingEvent = { owner: 'tenant', tenantId: SITE, type: 'product-change', eventAt: AT };
const PUBLISHED: IncomingEvent = { owner: 'site', siteId: SITE, type: 'merchant-publish', eventAt: AT };

// Хранилище в памяти с записью по условию — как у S3 (If-Match, If-None-Match).
function memoryStore(): ObjectStore {
  const objects = new Map<string, { body: Uint8Array; etag: string }>();
  let version = 0;
  return {
    read: (key) => Promise.resolve(objects.get(key) ?? null),
    has: (key) => Promise.resolve(objects.has(key)),
    write: (key, body, options) => {
      const current = objects.get(key);
      const condition = options.condition;
      const blocked =
        condition !== undefined &&
        ('ifMatch' in condition ? current?.etag !== condition.ifMatch : current !== undefined);
      if (blocked) return Promise.resolve({ written: false } as const);
      version += 1;
      const etag = `"${version}"`;
      objects.set(key, { body, etag });
      return Promise.resolve({ written: true, etag } as const);
    },
    list: () => Promise.resolve([]),
    remove: (keys) => {
      keys.forEach((key) => objects.delete(key));
      return Promise.resolve();
    },
  };
}

async function pathsOf(store: ObjectStore): Promise<string[] | null> {
  const object = await store.read(entitiesKey(SITE));
  if (object === null) return null;
  return parseEntityList(JSON.parse(new TextDecoder().decode(object.body)), entitiesKey(SITE)).paths;
}

const silent = (): void => undefined;

describe('адреса товаров в списке магазина', () => {
  it('создан — адрес дописан; удалён — убраны адрес и адрес по id', async () => {
    const store = memoryStore();
    await applyEntityPaths({ store, log: silent }, CREATED, SITE);
    expect(await pathsOf(store)).toEqual(['/product/sharf']);
    await applyEntityPaths({ store, log: silent }, DELETED, SITE);
    expect(await pathsOf(store)).toEqual([]);
  });

  it('без адресов, без хранилища или событие сайта — список не трогаем', async () => {
    const store = memoryStore();
    await applyEntityPaths({ store, log: silent }, EDITED, SITE);
    await applyEntityPaths({ store, log: silent }, PUBLISHED, SITE);
    await applyEntityPaths({ log: silent }, CREATED, SITE);
    expect(await pathsOf(store)).toBeNull();
  });

  it('сбой хранилища — строка журнала entity-paths-failed, ошибки наружу нет', async () => {
    const store: ObjectStore = { ...memoryStore(), read: () => Promise.reject(new Error('S3 недоступен')) };
    const logged: [string, LogFields | undefined][] = [];
    await applyEntityPaths({ store, log: (event, fields) => logged.push([event, fields]) }, CREATED, SITE);
    expect(logged).toEqual([['entity-paths-failed', { shopId: SITE, error: 'S3 недоступен' }]]);
  });
});

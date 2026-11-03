import type { ObjectStore } from '@merfy/storefront-storage';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createConductor, type ConductorDeps } from '../../src/release/conductor';
import { startExtensionRelease } from '../../src/release/extension-version';
import { createRelease, readRelease, releaseShops, setRelease, type NewRelease } from '../../src/release/store';
import { insertSite, openPool, resetBuilder } from './stack';

// Версия расширения, зарегистрированная в сервисе extensions, сама становится выпуском (design.md блока 10, П10-5 А, С7-14 Б):
// без этого загруженная фаундером версия до витрин не доходит — выпуск заводила только ручная команда.
const db = openPool();
const deps = { db, contour: 'dev', log: () => undefined };
const found = (version: string, extensionId = 'test-ext') => ({ extensionId, version });
const theme: NewRelease = {
  kind: 'theme',
  subject: 'nova',
  fromVersion: '0.0.1',
  toVersion: '0.0.9',
  toHash: `sha256:${'9'.repeat(64)}`,
  contour: 'dev',
  startedBy: 'test',
  status: 'awaiting',
};

beforeEach(async () => {
  await resetBuilder(db);
});

afterAll(async () => {
  await db.end();
});

describe('выпуск по новой версии расширения', () => {
  it('выпусков не было — planning с 0.0.0, без «да», запуск builder', async () => {
    const release = await startExtensionRelease(deps, found('0.2.5'));
    expect(release).toMatchObject({
      kind: 'extension',
      subject: 'test-ext',
      fromVersion: '0.0.0',
      toVersion: '0.2.5',
      toHash: '0.2.5',
      contour: 'dev',
      startedBy: 'builder',
      status: 'planning',
    });
  });

  it('«с» — последняя завершённая версия расширения', async () => {
    const first = await startExtensionRelease(deps, found('0.2.5'));
    await setRelease(db, first?.id ?? 0, ['planning'], { status: 'finished' });
    const second = await startExtensionRelease(deps, found('0.2.6'));
    expect(second).toMatchObject({ fromVersion: '0.2.5', toVersion: '0.2.6', status: 'planning' });
  });

  it('та же версия повторно (событие дважды) — второго выпуска нет', async () => {
    const first = await startExtensionRelease(deps, found('0.2.5'));
    expect(await startExtensionRelease(deps, found('0.2.5'))).toBeNull();
    await setRelease(db, first?.id ?? 0, ['planning'], { status: 'finished' });
    expect(await startExtensionRelease(deps, found('0.2.5'))).toBeNull();
    const { rows } = await db.query("SELECT count(*)::int AS n FROM storefront_release WHERE kind = 'extension'");
    expect(rows[0]).toEqual({ n: 1 });
  });

  it('на контуре идёт другой выпуск — выпуск расширения в очереди, а не потерян', async () => {
    await createRelease(db, theme, () => []);
    const release = await startExtensionRelease(deps, found('0.2.5'));
    expect(release).toMatchObject({ kind: 'extension', status: 'queued' });
  });
});

const refused = new Error('хранилище в этом тесте не нужно');
const store: ObjectStore = {
  read: () => Promise.resolve(null),
  has: () => Promise.reject(refused),
  write: () => Promise.reject(refused),
  list: () => Promise.reject(refused),
  remove: () => Promise.reject(refused),
};

describe('ведущий волн и выпуск расширения из очереди', () => {
  it('ждавший выпуск расширения встаёт в planning и получает магазины (а не testing без них)', async () => {
    const shop = await insertSite(db);
    const blocker = await createRelease(db, theme, () => []);
    const queued = await startExtensionRelease(deps, found('0.2.5'));
    expect(queued?.status).toBe('queued');
    const conductorDeps: ConductorDeps = {
      db,
      store,
      contour: 'dev',
      window: 1,
      pauseMs: 0,
      clock: () => new Date(),
      log: () => undefined,
      publishEvent: vi.fn(() => Promise.resolve()),
      publishCheck: vi.fn(() => Promise.resolve()),
      publishActivity: vi.fn(() => Promise.resolve()),
      pageCheck: () => Promise.reject(refused),
      themeIds: ['nova'],
      testShop: null,
      enabledExtensions: () => Promise.resolve([{ id: 'test-ext', version: '0.2.5' }]),
      renderHash: `sha256:${'b'.repeat(64)}`,
    };
    await setRelease(db, blocker.id, ['awaiting'], { status: 'finished' });
    await createConductor(conductorDeps).advance();
    const after = await readRelease(db, queued?.id ?? 0);
    expect(after?.status).not.toBe('queued');
    expect((await releaseShops(db, queued?.id ?? 0)).map((row) => row.siteId)).toEqual([shop.id]);
  });
});

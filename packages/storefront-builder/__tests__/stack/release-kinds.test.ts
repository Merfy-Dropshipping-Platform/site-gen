import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { planExtensionRelease, type EnabledExtension } from '../../src/release/extension';
import { startPlatformRelease } from '../../src/release/platform';
import { createRelease, readRelease, releaseShops } from '../../src/release/store';
import { insertSite, openPool, resetBuilder } from './stack';

// Выпуски платформы и расширения на стенде (задача 11): заводятся и раскладываются по волнам. Волны ведёт тот же
// ведущий — его ход проверяет release-waves.test.ts.
const db = openPool();
const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const HASH_C = `sha256:${'c'.repeat(64)}`;
const platformDeps = (testShop: string | null = null) => ({
  db,
  contour: 'dev',
  themeIds: ['nova'],
  testShop,
  log: () => undefined,
});
const state = (letter: string, renderHash: string) => ({ commit: letter.repeat(40), renderHash });
const siteIds = async (count: number): Promise<string[]> => {
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) ids.push((await insertSite(db)).id);
  return ids;
};

beforeEach(async () => {
  await resetBuilder(db);
  await db.query("UPDATE site SET deleted_at = now() WHERE theme_id = 'nova' AND deleted_at IS NULL");
});

afterAll(async () => {
  await db.end();
});

describe('выпуск платформы при старте сборщика', () => {
  it('первый старт — запись bootstrap без магазинов; тот же код — выпуска нет', async () => {
    await siteIds(1);
    const first = await startPlatformRelease(platformDeps(), state('a', HASH_A));
    expect(first).toMatchObject({ kind: 'platform', status: 'finished', startedBy: 'bootstrap', toHash: HASH_A });
    expect(await startPlatformRelease(platformDeps(), state('a', HASH_A))).toBeNull();
  });

  it('новый код — выпуск testing без «да», волна 0 — тестовый магазин', async () => {
    const ids = await siteIds(3);
    await startPlatformRelease(platformDeps(), state('a', HASH_A));
    const release = await startPlatformRelease(platformDeps(ids[1]), state('b', HASH_B));
    expect(release).toMatchObject({
      status: 'testing',
      fromVersion: 'a'.repeat(40),
      toVersion: 'b'.repeat(40),
      toHash: HASH_B,
    });
    const rows = await releaseShops(db, release?.id ?? 0);
    expect(rows).toHaveLength(3);
    expect(rows.filter((row) => row.wave === 0).map((row) => row.siteId)).toEqual([ids[1]]);
  });

  it('на контуре идёт выпуск темы — выпуск платформы в очереди', async () => {
    await startPlatformRelease(platformDeps(), state('a', HASH_A));
    const theme = {
      kind: 'theme',
      subject: 'nova',
      fromVersion: '0.0.1',
      toVersion: '0.0.9',
      toHash: HASH_A,
      contour: 'dev',
      startedBy: 'test',
      status: 'awaiting',
    } as const;
    await createRelease(db, theme, () => []);
    expect(await startPlatformRelease(platformDeps(), state('b', HASH_B))).toMatchObject({ status: 'queued' });
  });

  it('новый образ посреди выпуска платформы — прежний stopped, новый идёт', async () => {
    await startPlatformRelease(platformDeps(), state('a', HASH_A));
    const second = await startPlatformRelease(platformDeps(), state('b', HASH_B));
    const third = await startPlatformRelease(platformDeps(), state('c', HASH_C));
    expect((await readRelease(db, second?.id ?? 0))?.status).toBe('stopped');
    expect(third).toMatchObject({ status: 'testing', fromVersion: 'b'.repeat(40) });
  });
});

describe('выпуск версии расширения', () => {
  const planning = (version = '1.2.0') =>
    createRelease(
      db,
      {
        kind: 'extension',
        subject: 'reviews',
        fromVersion: '1.1.0',
        toVersion: version,
        toHash: version,
        contour: 'dev',
        startedBy: 'test',
        status: 'planning',
      },
      () => [],
    );
  const depsWith = (enabled: ReadonlyMap<string, readonly EnabledExtension[]>, testShop: string | null = null) => ({
    db,
    themeIds: ['nova'],
    testShop,
    enabledExtensions: (siteId: string) => Promise.resolve(enabled.get(siteId) ?? []),
  });
  const REVIEWS: readonly EnabledExtension[] = [{ id: 'reviews', version: '1.2.0' }];

  it('магазины с включённым расширением — в волнах, выпуск testing, волна 0 — тестовый', async () => {
    const [a, b, c] = await siteIds(3);
    const enabled = new Map<string, readonly EnabledExtension[]>([
      [a, REVIEWS],
      [b, []],
      [c, REVIEWS],
    ]);
    const release = await planning();
    expect(await planExtensionRelease(depsWith(enabled, c), release)).toBe(true);
    expect((await readRelease(db, release.id))?.status).toBe('testing');
    const rows = await releaseShops(db, release.id);
    expect(new Set(rows.map((row) => row.siteId))).toEqual(new Set([a, c]));
    expect(rows.find((row) => row.wave === 0)?.siteId).toBe(c);
  });

  it('ни у кого не включено — сразу finished', async () => {
    await siteIds(1);
    const release = await planning();
    expect(await planExtensionRelease(depsWith(new Map()), release)).toBe(true);
    expect((await readRelease(db, release.id))?.status).toBe('finished');
  });

  it('extensions отдаёт другую версию — stopped с причиной', async () => {
    const [shop] = await siteIds(1);
    const release = await planning('1.3.0');
    expect(await planExtensionRelease(depsWith(new Map([[shop, REVIEWS]])), release)).toBe(true);
    const stopped = await readRelease(db, release.id);
    expect(stopped?.status).toBe('stopped');
    expect(stopped?.stopReason).toContain('extensions отдаёт версию 1.2.0');
  });
});

import { z } from 'zod';
import { StorefrontBuilderError } from '../errors';
import type { Log } from '../log';
import type { Database, Queryable } from '../shop-state';
import {
  ACTIVE_STATUSES,
  createRelease,
  setRelease,
  type NewRelease,
  type ReleaseRow,
  type ReleaseStatus,
} from './store';
import { planWaves, type PlannedShop } from './waves';

// Выпуск платформы (design.md блока 10, П10-5 А и С7-14 Б): новый образ сборщика — новый код платформы. При старте:
// отпечаток кода (renderHash) не совпал с последним выпуском платформы на контуре — выпуск без «да»: волна 0 —
// тестовый магазин (RELEASE_TEST_SHOP), дальше волны сами. Первый старт — запись bootstrap, как у темы.

export interface PlatformState {
  commit: string;
  renderHash: string;
}

export interface PlatformDeps {
  db: Database;
  contour: string;
  themeIds: readonly string[];
  testShop: string | null;
  log: Log;
}

const LAST_SQL = `SELECT id, to_version, to_hash FROM storefront_release WHERE kind = 'platform' AND contour = $1
  ORDER BY id DESC LIMIT 1`;
const lastRow = z.object({ id: z.number(), to_version: z.string(), to_hash: z.string() });
const STORES_SQL = `SELECT id FROM site WHERE theme_id = ANY($1) AND status = 'published' AND deleted_at IS NULL
  ORDER BY id`;
const idRow = z.object({ id: z.string() });
const PENDING: readonly ReleaseStatus[] = [...ACTIVE_STATUSES, 'queued'];

// Опубликованные магазины новых тем — те же, что сверяет сборщик раз в час (reconcile.ts).
export async function themeStores(db: Queryable, themeIds: readonly string[]): Promise<string[]> {
  const { rows } = await db.query(STORES_SQL, [themeIds]);
  return rows.map((row) => idRow.parse(row).id);
}

// Тестовый магазин — в волну 0, только если он среди магазинов выпуска.
export const testShopOf = (ids: readonly string[], testShop: string | null): string | null =>
  testShop !== null && ids.includes(testShop) ? testShop : null;

async function createOrQueue(
  db: Database,
  release: NewRelease,
  plan: (id: number) => PlannedShop[],
): Promise<ReleaseRow> {
  try {
    return await createRelease(db, release, plan);
  } catch (error) {
    if (!(error instanceof StorefrontBuilderError) || error.code !== 'release-conflict') throw error;
    return createRelease(db, { ...release, status: 'queued' }, plan);
  }
}

export async function startPlatformRelease(deps: PlatformDeps, state: PlatformState): Promise<ReleaseRow | null> {
  const { rows } = await deps.db.query(LAST_SQL, [deps.contour]);
  const last = rows.map((row) => lastRow.parse(row)).at(0) ?? null;
  if (last !== null && last.to_hash === state.renderHash) return null;
  const base = {
    kind: 'platform',
    subject: 'platform',
    toVersion: state.commit,
    toHash: state.renderHash,
    contour: deps.contour,
  } as const;
  if (last === null)
    return createRelease(
      deps.db,
      { ...base, fromVersion: state.commit, startedBy: 'bootstrap', status: 'finished' },
      () => [],
    );
  // Прежний выпуск платформы ещё шёл — его кода в новом образе нет, дальше он не дойдёт.
  await setRelease(deps.db, last.id, PENDING, { status: 'stopped', stopReason: 'вышел новый образ сборщика' });
  const ids = await themeStores(deps.db, deps.themeIds);
  const release: NewRelease = { ...base, fromVersion: last.to_version, startedBy: 'builder', status: 'testing' };
  const created = await createOrQueue(deps.db, release, (id) => planWaves(ids, testShopOf(ids, deps.testShop), id));
  deps.log('release-platform', {
    release: created.id,
    status: created.status,
    shops: ids.length,
    from: last.to_version,
  });
  return created;
}

import { z } from 'zod';
import { StorefrontBuilderError } from '../errors';
import type { Database, Queryable } from '../shop-state';
import type { PlannedShop } from './waves';

// Журнал выпуска в базе sites (design.md блока 10, «Автостоп и журнал выпуска»; drizzle/*_storefront_release.sql). Переходы состояний —
// условные: «из каких состояний» в WHERE. Повтор и гонка двух обработчиков ничего не портят: второй получает false.

export type ReleaseKind = 'theme' | 'platform' | 'extension';
export type ReleaseStatus =
  | 'planning'
  | 'queued'
  | 'testing'
  | 'awaiting'
  | 'waves'
  | 'finished'
  | 'stopped'
  | 'reverted';
export type ShopStatus = 'waiting' | 'before' | 'building' | 'checking' | 'done' | 'skipped' | 'broken' | 'reverted';

export const RELEASE_CHANNEL = 'storefront_release';
export const ACTIVE_STATUSES: readonly ReleaseStatus[] = ['planning', 'testing', 'awaiting', 'waves'];
const UNIQUE_VIOLATION = '23505';

const releaseRowSchema = z.object({
  id: z.number(),
  kind: z.enum(['theme', 'platform', 'extension']),
  subject: z.string(),
  from_version: z.string(),
  to_version: z.string(),
  to_hash: z.string(),
  contour: z.string(),
  started_by: z.string(),
  status: z.enum(['planning', 'queued', 'testing', 'awaiting', 'waves', 'finished', 'stopped', 'reverted']),
  wave: z.number(),
  next_wave_at: z.date().nullable(),
  stop_reason: z.string().nullable(),
  report: z.record(z.string(), z.unknown()),
});

const shopRowSchema = z.object({
  release_id: z.number(),
  site_id: z.string(),
  wave: z.number(),
  position: z.number(),
  status: z.enum(['waiting', 'before', 'building', 'checking', 'done', 'skipped', 'broken', 'reverted']),
  build_before: z.number().nullable(),
  build_after: z.number().nullable(),
  version_before: z.string().nullable(),
  passport_before: z.unknown(),
  passport_after: z.unknown(),
  verdict: z.string().nullable(),
  error: z.string().nullable(),
});

export interface ReleaseRow {
  id: number;
  kind: ReleaseKind;
  subject: string;
  fromVersion: string;
  toVersion: string;
  toHash: string;
  contour: string;
  startedBy: string;
  status: ReleaseStatus;
  wave: number;
  nextWaveAt: Date | null;
  stopReason: string | null;
  report: Record<string, unknown>;
}

export interface ReleaseShopRow {
  releaseId: number;
  siteId: string;
  wave: number;
  position: number;
  status: ShopStatus;
  buildBefore: number | null;
  buildAfter: number | null;
  // Закрепление магазина до выпуска темы: на него вернёт откат (у магазина может быть и версия старше «с»).
  versionBefore: string | null;
  passportBefore: unknown;
  passportAfter: unknown;
  verdict: string | null;
  error: string | null;
}

export type NewRelease = Pick<
  ReleaseRow,
  'kind' | 'subject' | 'fromVersion' | 'toVersion' | 'toHash' | 'contour' | 'startedBy' | 'status'
>;

export type ShopPatch = Partial<Omit<ReleaseShopRow, 'releaseId' | 'siteId' | 'wave' | 'position'>>;
export type ReleasePatch = Partial<Pick<ReleaseRow, 'status' | 'wave' | 'nextWaveAt' | 'stopReason' | 'report'>>;

const RELEASE_COLUMNS = `id, kind, subject, from_version, to_version, to_hash, contour, started_by, status, wave,
  next_wave_at, stop_reason, report`;
// Колонки строки магазина с псевдонимом таблицы: у storefront_release тоже есть wave и status.
const SHOP_COLUMNS_SQL = `s.release_id, s.site_id, s.wave, s.position, s.status,
  s.build_before::float8 AS build_before, s.build_after::float8 AS build_after, s.version_before, s.passport_before,
  s.passport_after, s.verdict, s.error`;

function releaseOf(value: unknown): ReleaseRow {
  const row = releaseRowSchema.parse(value);
  return {
    id: row.id,
    kind: row.kind,
    subject: row.subject,
    fromVersion: row.from_version,
    toVersion: row.to_version,
    toHash: row.to_hash,
    contour: row.contour,
    startedBy: row.started_by,
    status: row.status,
    wave: row.wave,
    nextWaveAt: row.next_wave_at,
    stopReason: row.stop_reason,
    report: row.report,
  };
}

function shopOf(value: unknown): ReleaseShopRow {
  const row = shopRowSchema.parse(value);
  return {
    releaseId: row.release_id,
    siteId: row.site_id,
    wave: row.wave,
    position: row.position,
    status: row.status,
    buildBefore: row.build_before,
    buildAfter: row.build_after,
    versionBefore: row.version_before,
    passportBefore: row.passport_before,
    passportAfter: row.passport_after,
    verdict: row.verdict,
    error: row.error,
  };
}

async function transaction<T>(db: Database, work: (client: Queryable) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === UNIQUE_VIOLATION;

const INSERT_RELEASE = `INSERT INTO storefront_release (kind, subject, from_version, to_version, to_hash, contour,
  started_by, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${RELEASE_COLUMNS}`;
const INSERT_SHOPS = `INSERT INTO storefront_release_shop (release_id, site_id, wave, position)
  SELECT $1, shop.site_id, shop.wave, shop.position
  FROM jsonb_to_recordset($2::jsonb) AS shop(site_id text, wave integer, position integer)`;

// Выпуск, его магазины и NOTIFY — одной транзакцией. План получает номер выпуска: это зерно порядка волн. Другой
// активный выпуск на контуре — ошибка release-conflict.
export async function createRelease(
  db: Database,
  release: NewRelease,
  plan: (id: number) => PlannedShop[],
): Promise<ReleaseRow> {
  const values = [release.kind, release.subject, release.fromVersion, release.toVersion, release.toHash];
  try {
    return await transaction(db, async (client) => {
      const created = releaseOf(
        (await client.query(INSERT_RELEASE, [...values, release.contour, release.startedBy, release.status])).rows[0],
      );
      const shops = plan(created.id).map((shop) => ({
        site_id: shop.siteId,
        wave: shop.wave,
        position: shop.position,
      }));
      await client.query(INSERT_SHOPS, [created.id, JSON.stringify(shops)]);
      await client.query('SELECT pg_notify($1, $2)', [RELEASE_CHANNEL, String(created.id)]);
      return created;
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    throw new StorefrontBuilderError('release-conflict', 'на контуре уже идёт выпуск', { path: release.contour });
  }
}

export async function readRelease(db: Queryable, id: number): Promise<ReleaseRow | null> {
  const { rows } = await db.query(`SELECT ${RELEASE_COLUMNS} FROM storefront_release WHERE id = $1`, [id]);
  return rows.map(releaseOf).at(0) ?? null;
}

export async function activeReleases(db: Queryable, contour: string): Promise<ReleaseRow[]> {
  const sql = `SELECT ${RELEASE_COLUMNS} FROM storefront_release WHERE contour = $1 AND status = ANY($2) ORDER BY id`;
  return (await db.query(sql, [contour, ACTIVE_STATUSES])).rows.map(releaseOf);
}

export async function queuedReleases(db: Queryable, contour: string): Promise<ReleaseRow[]> {
  const sql = `SELECT ${RELEASE_COLUMNS} FROM storefront_release WHERE contour = $1 AND status = 'queued' ORDER BY id`;
  return (await db.query(sql, [contour])).rows.map(releaseOf);
}

const RELEASED_SQL = `SELECT to_version FROM storefront_release
  WHERE kind = 'theme' AND subject = $1 AND contour = $2 AND status = 'finished' ORDER BY id DESC LIMIT 1`;

// Выпущенная версия темы на контуре: её получает пустое закрепление (задача 4). Выпусков не было — null.
export async function releasedVersion(db: Queryable, themeId: string, contour: string): Promise<string | null> {
  const { rows } = await db.query(RELEASED_SQL, [themeId, contour]);
  return rows.map((row) => z.object({ to_version: z.string() }).parse(row).to_version).at(0) ?? null;
}

const BOOTSTRAP_SQL = `INSERT INTO storefront_release (kind, subject, from_version, to_version, to_hash, contour,
  started_by, status) SELECT 'theme', $1, $2, $2, $3, $4, 'bootstrap', 'finished'
  WHERE NOT EXISTS (SELECT 1 FROM storefront_release WHERE kind = 'theme' AND subject = $1 AND contour = $4)`;

// Первый старт сборщика с выпусками: версия образа считается выпущенной, если выпусков темы ещё не было.
export async function bootstrapRelease(
  db: Queryable,
  themeId: string,
  state: { version: string; contentHash: string },
  contour: string,
): Promise<boolean> {
  const result = await db.query(BOOTSTRAP_SQL, [themeId, state.version, state.contentHash, contour]);
  return (result.rowCount ?? 0) > 0;
}

export async function releaseShops(db: Queryable, releaseId: number): Promise<ReleaseShopRow[]> {
  const sql = `SELECT ${SHOP_COLUMNS_SQL} FROM storefront_release_shop s WHERE s.release_id = $1
    ORDER BY s.wave, s.position`;
  return (await db.query(sql, [releaseId])).rows.map(shopOf);
}

export async function waveShops(db: Queryable, releaseId: number, wave: number): Promise<ReleaseShopRow[]> {
  const sql = `SELECT ${SHOP_COLUMNS_SQL} FROM storefront_release_shop s WHERE s.release_id = $1 AND s.wave = $2
    ORDER BY s.position`;
  return (await db.query(sql, [releaseId, wave])).rows.map(shopOf);
}

const ACTIVE_SHOP_SQL = `SELECT ${SHOP_COLUMNS_SQL} FROM storefront_release_shop s
  JOIN storefront_release r ON r.id = s.release_id
  WHERE s.site_id = $1 AND r.status = ANY($2) AND s.status = ANY($3) ORDER BY s.release_id DESC LIMIT 1`;

// Строка магазина в активном выпуске, ждущая его сборки или проверки. Нет — null: сборка не выпускная.
export async function activeShopOf(
  db: Queryable,
  siteId: string,
  statuses: readonly ShopStatus[],
): Promise<ReleaseShopRow | null> {
  const { rows } = await db.query(ACTIVE_SHOP_SQL, [siteId, ACTIVE_STATUSES, statuses]);
  return rows.map(shopOf).at(0) ?? null;
}

const FOREIGN_SQL = `SELECT r.id FROM storefront_release_shop s JOIN storefront_release r ON r.id = s.release_id
  WHERE s.site_id = $1 AND s.status = 'building' AND r.kind = 'platform' AND r.status = ANY($2) AND r.to_hash <> $3
  LIMIT 1`;
const idRow = z.object({ id: z.number() });

// Магазин ждёт сборки выпуска платформы с другим кодом (П10-7 А): собрать его вправе только сборщик с этим кодом.
// Ответ — номер такого выпуска; нет — null. Только чтение.
export async function foreignPlatformRelease(
  db: Queryable,
  siteId: string,
  renderHash: string,
): Promise<number | null> {
  const { rows } = await db.query(FOREIGN_SQL, [siteId, ACTIVE_STATUSES, renderHash]);
  return rows.map((row) => idRow.parse(row).id).at(0) ?? null;
}

const SHOP_COLUMNS = new Map<keyof ShopPatch, string>([
  ['status', 'status'],
  ['buildBefore', 'build_before'],
  ['buildAfter', 'build_after'],
  ['versionBefore', 'version_before'],
  ['passportBefore', 'passport_before'],
  ['passportAfter', 'passport_after'],
  ['verdict', 'verdict'],
  ['error', 'error'],
]);

const RELEASE_PATCH_COLUMNS = new Map<keyof ReleasePatch, string>([
  ['status', 'status'],
  ['wave', 'wave'],
  ['nextWaveAt', 'next_wave_at'],
  ['stopReason', 'stop_reason'],
  ['report', 'report'],
]);

// Объекты (паспорта, отчёт) — в jsonb строкой JSON: node-postgres сам так не делает для массивов.
const sqlValue = (value: unknown): unknown =>
  typeof value === 'object' && value !== null && !(value instanceof Date) ? JSON.stringify(value) : value;

function assignments<K extends string>(
  patch: Partial<Record<K, unknown>>,
  columns: ReadonlyMap<K, string>,
  from: number,
) {
  const fields = [...columns].filter(([field]) => patch[field] !== undefined);
  return {
    sql: fields.map(([, column], index) => `${column} = $${from + index}`).join(', '),
    values: fields.map(([field]) => sqlValue(patch[field])),
  };
}

// Перевести магазин выпуска: только из состояний from. Вернёт, удалось ли.
export async function setShop(
  db: Queryable,
  key: { releaseId: number; siteId: string },
  from: readonly ShopStatus[],
  patch: ShopPatch,
): Promise<boolean> {
  const set = assignments(patch, SHOP_COLUMNS, 4);
  const sql = `UPDATE storefront_release_shop SET ${set.sql}, updated_at = now()
    WHERE release_id = $1 AND site_id = $2 AND status = ANY($3)`;
  const result = await db.query(sql, [key.releaseId, key.siteId, from, ...set.values]);
  return (result.rowCount ?? 0) > 0;
}

export async function setRelease(
  db: Queryable,
  id: number,
  from: readonly ReleaseStatus[],
  patch: ReleasePatch,
): Promise<boolean> {
  const set = assignments(patch, RELEASE_PATCH_COLUMNS, 3);
  const sql = `UPDATE storefront_release SET ${set.sql}, updated_at = now() WHERE id = $1 AND status = ANY($2)`;
  const result = await db.query(sql, [id, from, ...set.values]);
  return (result.rowCount ?? 0) > 0;
}

export async function notifyRelease(db: Queryable, id: number): Promise<void> {
  await db.query('SELECT pg_notify($1, $2)', [RELEASE_CHANNEL, String(id)]);
}

const PLANNED_SQL = `UPDATE storefront_release SET status = 'testing', updated_at = now()
  WHERE id = $1 AND status = 'planning'`;

// Выпуск расширения (задача 11): список магазинов известен после вызовов extensions — строки магазинов и переход
// planning → testing одной транзакцией. Вернёт false, если выпуск уже не в planning.
export async function planReleaseShops(
  db: Database,
  releaseId: number,
  plan: readonly PlannedShop[],
): Promise<boolean> {
  const shops = plan.map((shop) => ({ site_id: shop.siteId, wave: shop.wave, position: shop.position }));
  return transaction(db, async (client) => {
    const moved = await client.query(PLANNED_SQL, [releaseId]);
    if ((moved.rowCount ?? 0) === 0) return false;
    await client.query(INSERT_SHOPS, [releaseId, JSON.stringify(shops)]);
    return true;
  });
}

const SWITCH_SQL = `INSERT INTO site_theme_migrations (id, site_id, from_theme, from_version, to_theme, to_version,
  report, "timestamp") VALUES (gen_random_uuid()::text, $1, $2, $3, $2, $4, $5, now() AT TIME ZONE 'UTC')`;

// Переключение версии темы магазина — строка в журнале смены темы (факт 4 design.md): выпуск и откат выпуска.
export async function recordThemeSwitch(
  db: Queryable,
  change: { siteId: string; themeId: string; from: string; to: string; report: Record<string, unknown> },
): Promise<void> {
  await db.query(SWITCH_SQL, [change.siteId, change.themeId, change.from, change.to, JSON.stringify(change.report)]);
}

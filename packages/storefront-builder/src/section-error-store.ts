import type { SectionFailure } from '@merfy/storefront-build';
import { z } from 'zod';
import { SECTION_ERRORS_QUEUE, type Broker } from './broker';
import type { Log } from './log';
import { SECTION_ERROR_STAGES, parseSectionErrors, type SectionErrorBatch } from './section-errors';
import type { Database, Queryable } from './shop-state';

// Таблица storefront_section_error базы sites (план блока 11 «Каркаса витрины», часть 4; drizzle/*_storefront_section_
// error.sql) и потребитель очереди storefront_section_errors. Счёт для автостопа выпуска (блок 10) —
// sectionErrorSummary: сколько магазинов и ошибок у выпуска секции за окно. Пороги выбирает блок 10.
const SECTION_ERRORS_PREFETCH = 10;

// Строка на магазин, секцию, отпечаток, стадию, текст и минуту; повтор — count + n. Автор, владелец и выпуск — из
// реестра секций (блок 7) по имени и отпечатку: своя секция магазина — только этого магазина, выпуск платформы, темы и
// расширения — любой. Строк несколько (тот же код в двух выпусках) — сначала своя секция магазина, потом последний
// выпуск. Незнакомый отпечаток и магазин, которого у сборщика нет (storefront_shop), не пишутся.
const RECORD_SQL = `
INSERT INTO storefront_section_error AS e
  (site_id, section, script_hash, author, owner, release, stage, message, minute, count)
SELECT $1, r.section, r.script_hash, s.author, s.owner, s.release, r.stage, r.message, $2::timestamptz, r.count
FROM jsonb_to_recordset($3::jsonb) AS r(section text, script_hash text, stage text, message text, count integer)
CROSS JOIN LATERAL (
  SELECT author, owner, release FROM storefront_section
  WHERE name = r.section AND script_hash = r.script_hash AND (author <> 'shop' OR owner = $1)
  ORDER BY (owner = $1) DESC, created_at DESC, id
  LIMIT 1
) s
WHERE EXISTS (SELECT 1 FROM storefront_shop WHERE site_id = $1)
ON CONFLICT (site_id, section, script_hash, stage, minute, message) DO UPDATE SET count = e.count + EXCLUDED.count`;

// Ошибки рендера секций (блок 2 «Секций и SDK», «Решил сам» п. 8) сборщик пишет сам, без очереди. Строка — как у ошибки
// из браузера, в script_hash — хеш модуля рендера; автор, владелец и выпуск — из таблицы секций по имени и render_hash.
const RECORD_RENDER_SQL = `
INSERT INTO storefront_section_error AS e
  (site_id, section, script_hash, author, owner, release, stage, message, minute, count)
SELECT $1, r.section, r.hash, s.author, s.owner, s.release, r.stage, r.message, $2::timestamptz, r.count
FROM jsonb_to_recordset($3::jsonb) AS r(section text, hash text, stage text, message text, count integer)
CROSS JOIN LATERAL (
  SELECT author, owner, release FROM storefront_section
  WHERE name = r.section AND render_hash = r.hash AND (author <> 'shop' OR owner = $1)
  ORDER BY (owner = $1) DESC, created_at DESC, id
  LIMIT 1
) s
WHERE EXISTS (SELECT 1 FROM storefront_shop WHERE site_id = $1)
ON CONFLICT (site_id, section, script_hash, stage, minute, message) DO UPDATE SET count = e.count + EXCLUDED.count`;
// Текст ошибки — не длиннее, чем у ошибок из браузеров (section-errors.ts).
const RENDER_MESSAGE_LENGTH = 300;

// Окно — с минуты since включительно: строки таблицы поминутные.
const SUMMARY_SQL = `
SELECT author, owner, release, section, script_hash AS "scriptHash",
  count(DISTINCT site_id)::int AS shops, sum(count)::int AS errors
FROM storefront_section_error
WHERE minute >= date_trunc('minute', $1::timestamptz)
GROUP BY author, owner, release, section, script_hash
ORDER BY errors DESC, section COLLATE "C", script_hash COLLATE "C"`;

const summaryRowSchema = z.object({
  author: z.string(),
  owner: z.string(),
  release: z.string().nullable(),
  section: z.string(),
  scriptHash: z.string(),
  shops: z.number().int(),
  errors: z.number().int(),
});

export type SectionErrorSummaryRow = z.infer<typeof summaryRowSchema>;

export interface RecordedErrors {
  written: number;
  skipped: number;
}

export interface SectionErrorDeps {
  broker: Pick<Broker, 'consume'>;
  db: Queryable;
  log: Log;
  // Блок 12, часть 12в: запись под замком магазина, счёт секций с ролью и откат по порогу (role-rollback.ts). Нет —
  // только запись, как в блоке 11.
  roles?: { db: Database; after: AfterCounted };
}

export async function recordSectionErrors(db: Queryable, batch: SectionErrorBatch): Promise<RecordedErrors> {
  const rows = batch.rows.map((row) => ({
    section: row.section,
    script_hash: row.scriptHash,
    stage: row.stage,
    message: row.message,
    count: row.count,
  }));
  const result = await db.query(RECORD_SQL, [batch.shopId, batch.minute, JSON.stringify(rows)]);
  const written = result.rowCount ?? 0;
  return { written, skipped: rows.length - written };
}

export interface RenderErrorBatch {
  shopId: string;
  minute: string;
  failures: readonly SectionFailure[];
}

interface RenderErrorRow {
  section: string;
  hash: string;
  stage: string;
  message: string;
  count: number;
}

// Одинаковые отказы одной сборки (секция на нескольких страницах) — одна строка со счётчиком: INSERT … ON CONFLICT одну
// строку дважды не обновит.
function renderRowsOf(failures: readonly SectionFailure[]): RenderErrorRow[] {
  const rows = new Map<string, RenderErrorRow>();
  for (const failure of failures) {
    const message = failure.message.slice(0, RENDER_MESSAGE_LENGTH);
    const key = JSON.stringify([failure.section, failure.hash, failure.stage, message]);
    const row = rows.get(key) ?? {
      section: failure.section,
      hash: failure.hash,
      stage: failure.stage,
      message,
      count: 0,
    };
    row.count += 1;
    rows.set(key, row);
  }
  return [...rows.values()];
}

export async function recordRenderErrors(db: Queryable, batch: RenderErrorBatch): Promise<RecordedErrors> {
  const rows = renderRowsOf(batch.failures);
  if (rows.length === 0) return { written: 0, skipped: 0 };
  const result = await db.query(RECORD_RENDER_SQL, [batch.shopId, batch.minute, JSON.stringify(rows)]);
  const written = result.rowCount ?? 0;
  return { written, skipped: rows.length - written };
}

// Для автостопа выпуска (блок 10): строка на выпуск секции — сколько магазинов и ошибок с минуты since.
export async function sectionErrorSummary(db: Queryable, since: Date): Promise<SectionErrorSummaryRow[]> {
  const { rows } = await db.query(SUMMARY_SQL, [since.toISOString()]);
  return summaryRowSchema.array().parse(rows);
}

// Порог ошибок секции из браузеров (блок 12 «Секций и SDK», часть 12в; design.md блока 12, В12-1 А): сумма count по
// магазину, секции и отпечатку скрипта за окно — последние SECTION_ERROR_WINDOW_MINUTES минут, считая минуту пачки.
// Автостоп выпуска по ошибкам из браузеров (блок 10 каркаса) ещё не написан — когда появится, берёт эти же значения.
// Значения — до замера на магазинах с покупателями (риск 1 блока 12: ложный откат).
export const SECTION_ERROR_WINDOW_MINUTES = 15;
export const SECTION_ERROR_LIMIT = 10;
const MINUTE_MS = 60_000;
// Только ошибки из браузеров: ошибки рендера пишет сборка с отпечатком модуля рендера (recordRenderErrors).
const BROWSER_STAGES: string[] = [...SECTION_ERROR_STAGES];

// Секция с ролью из пачки: сумма за окно после пачки (errors) и до неё (before), самая частая ошибка окна.
export interface RoleErrorCount {
  section: string;
  role: string;
  title: string;
  scriptHash: string;
  errors: number;
  before: number;
  stage: string;
  message: string;
}

export interface CountedErrors extends RecordedErrors {
  roles: RoleErrorCount[];
}

// Что делать после записи и счёта (role-rollback.ts) — передаётся зависимостью: модуль отката читает этот.
export type AfterCounted = (batch: SectionErrorBatch, counted: CountedErrors) => Promise<void>;

const SHOP_ERRORS_LOCK_SQL = 'SELECT pg_advisory_xact_lock(hashtext($1))';
// Своя секция магазина на витрине, с ролью и тем же отпечатком, что у ошибок пачки; ошибок нет — строки нет.
const ROLE_COUNTS_SQL = `
SELECT s.name AS section, s.manifest->>'role' AS role, coalesce(s.manifest->>'title', s.name) AS title,
  s.script_hash AS "scriptHash", w.errors, top.stage, top.message
FROM storefront_section s
CROSS JOIN LATERAL (
  SELECT sum(e.count)::int AS errors FROM storefront_section_error e
  WHERE e.site_id = $1 AND e.section = s.name AND e.script_hash = s.script_hash
    AND e.minute >= $2::timestamptz AND e.stage = ANY($3::text[])
) w
CROSS JOIN LATERAL (
  SELECT e.stage, e.message FROM storefront_section_error e
  WHERE e.site_id = $1 AND e.section = s.name AND e.script_hash = s.script_hash
    AND e.minute >= $2::timestamptz AND e.stage = ANY($3::text[])
  GROUP BY e.stage, e.message
  ORDER BY sum(e.count) DESC, e.message COLLATE "C"
  LIMIT 1
) top
WHERE s.author = 'shop' AND s.owner = $1 AND s.published AND s.manifest ? 'role'
  AND (s.name, s.script_hash) IN (SELECT * FROM unnest($4::text[], $5::text[]))
ORDER BY s.name COLLATE "C"`;

const roleCountRow = z.object({
  section: z.string(),
  role: z.string(),
  title: z.string(),
  scriptHash: z.string(),
  errors: z.number().int(),
  stage: z.string(),
  message: z.string(),
});

// Начало окна: минута пачки минус (окно − 1) минут.
export const windowStart = (minute: string): string =>
  new Date(Date.parse(minute) - (SECTION_ERROR_WINDOW_MINUTES - 1) * MINUTE_MS).toISOString();

const ownCount = (batch: SectionErrorBatch, section: string, scriptHash: string): number =>
  batch.rows
    .filter((row) => row.section === section && row.scriptHash === scriptHash)
    .reduce((sum, row) => sum + row.count, 0);

async function roleCounts(client: Queryable, batch: SectionErrorBatch): Promise<RoleErrorCount[]> {
  const sections = batch.rows.map((row) => row.section);
  const hashes = batch.rows.map((row) => row.scriptHash);
  const params = [batch.shopId, windowStart(batch.minute), BROWSER_STAGES, sections, hashes];
  const { rows } = await client.query(ROLE_COUNTS_SQL, params);
  return rows.map((row) => {
    const count = roleCountRow.parse(row);
    return { ...count, before: count.errors - ownCount(batch, count.section, count.scriptHash) };
  });
}

// Запись пачки и счёт секций с ролью — одна транзакция под замком магазина: пачки одного магазина считаются по очереди,
// поэтому before — точно сумма до этой пачки. Ничего не записано (магазина у сборщика нет) — счёта нет.
export async function recordCounted(db: Database, batch: SectionErrorBatch): Promise<CountedErrors> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(SHOP_ERRORS_LOCK_SQL, [`storefront_section_error:${batch.shopId}`]);
    const recorded = await recordSectionErrors(client, batch);
    const roles = recorded.written === 0 ? [] : await roleCounts(client, batch);
    await client.query('COMMIT');
    return { ...recorded, roles };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Ошибки своей секции магазина из браузеров по отпечатку скрипта — для «правок секции» (блок 14, Р12в-10): до трёх
// самых частых на отпечаток, за всё время, что строки лежат в таблице.
export interface SectionEditError {
  scriptHash: string;
  stage: string;
  message: string;
  count: number;
  lastAt: string;
}

const EDIT_ERRORS_SQL = `
SELECT script_hash AS "scriptHash", stage, message, total AS count, last_at AS "lastAt" FROM (
  SELECT script_hash, stage, message, sum(count)::int AS total,
    to_char(max(minute) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_at,
    row_number() OVER (PARTITION BY script_hash ORDER BY sum(count) DESC, message COLLATE "C") AS place
  FROM storefront_section_error
  WHERE site_id = $1 AND section = $2 AND stage = ANY($3::text[])
  GROUP BY script_hash, stage, message
) ranked
WHERE place <= 3
ORDER BY script_hash COLLATE "C", total DESC, message COLLATE "C"`;

const editErrorRow = z.object({
  scriptHash: z.string(),
  stage: z.string(),
  message: z.string(),
  count: z.number().int(),
  lastAt: z.string(),
});

export async function sectionEditErrors(db: Queryable, shopId: string, name: string): Promise<SectionEditError[]> {
  const { rows } = await db.query(EDIT_ERRORS_SQL, [shopId, name, BROWSER_STAGES]);
  return editErrorRow.array().parse(rows);
}

// Потребитель очереди шлюза. Негодное сообщение — message-invalid: брокер пишет строку журнала и подтверждает его;
// база недоступна — сообщение вернётся в очередь (broker.ts, deliver).
export async function consumeSectionErrors(deps: SectionErrorDeps): Promise<void> {
  await deps.broker.consume(SECTION_ERRORS_QUEUE, SECTION_ERRORS_PREFETCH, async ({ body }) => {
    const batch = parseSectionErrors(body);
    const { roles } = deps;
    if (roles === undefined) {
      const recorded = await recordSectionErrors(deps.db, batch);
      deps.log('section-errors', { shopId: batch.shopId, minute: batch.minute, ...recorded });
      return;
    }
    const counted = await recordCounted(roles.db, batch);
    const { written, skipped } = counted;
    deps.log('section-errors', { shopId: batch.shopId, minute: batch.minute, written, skipped });
    await roles.after(batch, counted);
  });
}

import type { Pool } from 'pg';
import { z } from 'zod';

// Строка магазина в базе sites (design.md блока 6, В6-3 Б и В6-4 Б) — вся память сборщика: идёт ли сборка, номер,
// замок со сроком, «ещё раз», повтор упавшей. Каждое решение — один условный UPDATE … RETURNING: из двух сборщиков,
// которые решают одно и то же, строку меняет один.
//   idle     — магазин свободен;
//   busy     — задание в очереди или собирается; замок до lease_until;
//   retrying — сборка упала, повтор в retry_at;
//   stopped  — упали все запуски: тревога ушла, ждём события или команды перезапуска.
// pending — сколько событий пришло, пока магазин занят: это «ещё раз», следующая сборка одна на все.

export type Queryable = Pick<Pool, 'query'>;

export interface ShopStateOptions {
  leaseMs: number;
  // Паузы перед повторами: [5 000, 30 000] — три запуска (первый и два повтора), потом «остановлено».
  retryDelaysMs: readonly number[];
}

export interface StartedJob {
  siteId: string;
  build: number;
  priority: number;
}

// started — задание ушло в очередь; coalesced — событие склеено: events — сколько событий в ждущем задании, pending —
// сколько ждут следующей сборки («ещё раз»).
export type Accepted =
  | ({ outcome: 'started' } & StartedJob)
  | { outcome: 'coalesced'; siteId: string; events: number; pending: number };

export interface ShopEvent {
  siteId: string;
  priority: number;
  eventAt: string;
}

// Номер сборки: время в миллисекундах, но не меньше прошлого номера плюс один. Сборка, начатая позже, — с большим
// номером; указатель блока 5 пишет «только если новее», и номер не откатится, даже если строку магазина создали заново.
const NEXT_BUILD = 'GREATEST(build + 1, (extract(epoch FROM clock_timestamp()) * 1000)::bigint)';
const lease = (param: string): string => `now() + ${param} * interval '1 millisecond'`;

const startedRow = z.object({ site_id: z.string(), build: z.coerce.number().int(), priority: z.int() });
const coalescedRow = z.object({ events: z.int(), pending: z.int() });

const toStarted = (row: z.infer<typeof startedRow>): StartedJob => ({
  siteId: row.site_id,
  build: row.build,
  priority: row.priority,
});

// Свободен или остановлен — сборка сразу. События, что ждали в остановленном магазине, едут в неё же.
const START_SQL = `UPDATE storefront_shop SET state = 'busy', build = ${NEXT_BUILD}, lease_until = ${lease('$2')},
  queued_at = now(), started_at = NULL, attempt = 0, retry_at = NULL, error = NULL,
  events = 1 + pending, priority = GREATEST($3, pending_priority), event_at = LEAST($4::timestamptz, pending_event_at),
  pending = 0, pending_priority = 0, pending_event_at = NULL
  WHERE site_id = $1 AND state IN ('idle', 'stopped') RETURNING site_id, build, priority`;

// Занят. Задание ещё в очереди (started_at пуст) — событие едет в него: данные сборка прочтёт при старте. Сборка уже
// идёт или ждёт повтора — «ещё раз»: счётчик, самый высокий приоритет и самое раннее время правки среди ждущих.
const QUEUED = "(state = 'busy' AND started_at IS NULL)";
const COALESCE_SQL = `UPDATE storefront_shop SET
  events = CASE WHEN ${QUEUED} THEN events + 1 ELSE events END,
  priority = CASE WHEN ${QUEUED} THEN GREATEST(priority, $2) ELSE priority END,
  event_at = CASE WHEN ${QUEUED} THEN LEAST(event_at, $3::timestamptz) ELSE event_at END,
  pending = CASE WHEN ${QUEUED} THEN pending ELSE pending + 1 END,
  pending_priority = CASE WHEN ${QUEUED} THEN pending_priority ELSE GREATEST(pending_priority, $2) END,
  pending_event_at = CASE WHEN ${QUEUED} THEN pending_event_at ELSE LEAST(pending_event_at, $3::timestamptz) END
  WHERE site_id = $1 AND state IN ('busy', 'retrying') RETURNING events, pending`;

// Между двумя запросами состояние может смениться (сборка кончилась) — тогда пробуем снова.
const ACCEPT_ATTEMPTS = 5;

// Событие пришло: магазин свободен — сборка сразу (started); занят — «ещё раз» (coalesced).
export async function acceptEvent(db: Queryable, event: ShopEvent, options: ShopStateOptions): Promise<Accepted> {
  await db.query('INSERT INTO storefront_shop (site_id) VALUES ($1) ON CONFLICT (site_id) DO NOTHING', [event.siteId]);
  for (let attempt = 1; attempt <= ACCEPT_ATTEMPTS; attempt += 1) {
    const start = [event.siteId, options.leaseMs, event.priority, event.eventAt];
    const started = (await db.query(START_SQL, start)).rows.map((row) => startedRow.parse(row));
    if (started.length > 0) return { outcome: 'started', ...toStarted(started[0]) };
    const coalesce = [event.siteId, event.priority, event.eventAt];
    const coalesced = (await db.query(COALESCE_SQL, coalesce)).rows.map((row) => coalescedRow.parse(row));
    if (coalesced.length > 0) return { outcome: 'coalesced', siteId: event.siteId, ...coalesced[0] };
  }
  throw new Error(`storefront_shop ${event.siteId}: состояние меняется слишком часто`);
}

const claimedRow = z.object({
  build: z.coerce.number().int(),
  attempt: z.int(),
  priority: z.int(),
  events: z.int(),
  event_at: z.date(),
  queued_at: z.date(),
  started_at: z.date(),
});

export interface ClaimedJob extends StartedJob {
  attempt: number;
  events: number;
  eventAt: Date;
  queuedAt: Date;
  startedAt: Date;
}

const CLAIM_SQL = `UPDATE storefront_shop SET started_at = now(), lease_until = ${lease('$2')}
  WHERE site_id = $1 AND build = $3 AND state = 'busy' AND (started_at IS NULL OR lease_until < now())
  RETURNING build, attempt, priority, events, event_at, queued_at, started_at`;

const toClaimed = (siteId: string, row: z.infer<typeof claimedRow>): ClaimedJob => ({
  siteId,
  build: row.build,
  attempt: row.attempt,
  priority: row.priority,
  events: row.events,
  eventAt: row.event_at,
  queuedAt: row.queued_at,
  startedAt: row.started_at,
});

// Взять задание: номер совпадает с номером в строке, и задание ещё никто не взял (или его замок истёк). Иначе — null:
// задание устарело (вместо него поставили новое) или его уже собирают.
export async function claimJob(db: Queryable, job: StartedJob, leaseMs: number): Promise<ClaimedJob | null> {
  const rows = (await db.query(CLAIM_SQL, [job.siteId, leaseMs, job.build])).rows.map((row) => claimedRow.parse(row));
  return rows.length === 0 ? null : toClaimed(job.siteId, rows[0]);
}

export type Finished =
  | { state: 'idle' }
  | ({ state: 'busy' } & StartedJob)
  | { state: 'retrying'; attempt: number }
  | { state: 'stopped'; attempt: number };

const SUCCESS_SQL = `UPDATE storefront_shop SET
  state = CASE WHEN pending > 0 THEN 'busy' ELSE 'idle' END,
  build = CASE WHEN pending > 0 THEN ${NEXT_BUILD} ELSE build END,
  lease_until = CASE WHEN pending > 0 THEN ${lease('$2')} END,
  queued_at = CASE WHEN pending > 0 THEN now() END,
  started_at = NULL, attempt = 0, error = NULL,
  events = pending, priority = pending_priority, event_at = pending_event_at,
  pending = 0, pending_priority = 0, pending_event_at = NULL
  WHERE site_id = $1 AND build = $3 AND state = 'busy' RETURNING site_id, state, build, priority, attempt`;

const FAILURE_SQL = `UPDATE storefront_shop SET
  attempt = attempt + 1,
  state = CASE WHEN attempt + 1 > cardinality($2::int[]) THEN 'stopped' ELSE 'retrying' END,
  retry_at = now() + ($2::int[])[attempt + 1] * interval '1 millisecond',
  started_at = NULL, lease_until = NULL, error = $4
  WHERE site_id = $1 AND build = $3 AND state = 'busy' RETURNING site_id, state, build, priority, attempt`;

const finishedRow = z.object({
  site_id: z.string(),
  state: z.enum(['idle', 'busy', 'retrying', 'stopped']),
  build: z.coerce.number().int(),
  priority: z.int(),
  attempt: z.int(),
});

const FINISHED: { [S in Finished['state']]: (row: z.infer<typeof finishedRow>) => Finished } = {
  idle: () => ({ state: 'idle' }),
  busy: (row) => ({ state: 'busy', ...toStarted(row) }),
  retrying: (row) => ({ state: 'retrying', attempt: row.attempt }),
  stopped: (row) => ({ state: 'stopped', attempt: row.attempt }),
};

async function finish(db: Queryable, sql: string, values: unknown[]): Promise<Finished | null> {
  const rows = (await db.query(sql, values)).rows.map((row) => finishedRow.parse(row));
  return rows.length === 0 ? null : FINISHED[rows[0].state](rows[0]);
}

// Сборка удалась: при «ещё раз» — сразу следующее задание (busy, новый номер), иначе магазин свободен. null — строку
// уже поменял кто-то другой (замок истёк, и задание переставили): записывать нечего.
export const finishSuccess = (db: Queryable, job: StartedJob, options: ShopStateOptions): Promise<Finished | null> =>
  finish(db, SUCCESS_SQL, [job.siteId, options.leaseMs, job.build]);

// Сборка упала: повтор через паузу или, если запуски кончились, «остановлено».
export const finishFailure = (
  db: Queryable,
  job: StartedJob,
  error: string,
  options: ShopStateOptions,
): Promise<Finished | null> => finish(db, FAILURE_SQL, [job.siteId, options.retryDelaysMs, job.build, error]);

// Пауза перед повтором прошла — задание снова, с новым номером. События, пришедшие за паузу, едут в этот же повтор.
const RETRY_SQL = `UPDATE storefront_shop SET state = 'busy', build = ${NEXT_BUILD}, lease_until = ${lease('$1')},
  queued_at = now(), started_at = NULL, retry_at = NULL,
  events = events + pending, priority = GREATEST(priority, pending_priority),
  event_at = LEAST(event_at, pending_event_at),
  pending = 0, pending_priority = 0, pending_event_at = NULL
  WHERE state = 'retrying' AND retry_at <= now() RETURNING site_id, build, priority`;

export async function startDueRetries(db: Queryable, options: ShopStateOptions): Promise<StartedJob[]> {
  const rows = (await db.query(RETRY_SQL, [options.leaseMs])).rows;
  return rows.map((row) => toStarted(startedRow.parse(row)));
}

// Сборки с истёкшим замком: сборщик умер посреди сборки. Их заканчивают как упавшие — повтор по общей лестнице
// (finishFailure).
export async function expiredJobs(db: Queryable): Promise<StartedJob[]> {
  const sql = `SELECT site_id, build, priority FROM storefront_shop
    WHERE state = 'busy' AND started_at IS NOT NULL AND lease_until < now()`;
  return (await db.query(sql)).rows.map((row) => toStarted(startedRow.parse(row)));
}

// Задание так и не взяли за срок замка: сообщение могло потеряться (брокер упал при постановке). Тот же номер — снова в
// очередь, замок продлён; если старое сообщение всё же придёт, взять его выйдет только один раз (claimJob).
const RENEW_SQL = `UPDATE storefront_shop SET lease_until = ${lease('$1')}
  WHERE state = 'busy' AND started_at IS NULL AND lease_until < now() RETURNING site_id, build, priority`;

export async function renewLostJobs(db: Queryable, options: ShopStateOptions): Promise<StartedJob[]> {
  return (await db.query(RENEW_SQL, [options.leaseMs])).rows.map((row) => toStarted(startedRow.parse(row)));
}

import type { ClaimedJob, Queryable } from './shop-state';

// Строка сборки в базе sites (design.md блока 6, В6-5 Б): время правки, постановки, старта и конца, итог и время шагов.
// По ней p95 «правка → витрина» считается одним запросом (README пакета).

// Итог: live, paused, stale, unchanged — ответ выкладки блока 5; skipped — ключ совпал с живой сборкой, собирать
// нечего; failed — сборка упала, ошибка в error.
export type BuildOutcome = 'live' | 'paused' | 'stale' | 'unchanged' | 'skipped' | 'failed';

// Время шагов, мс: queue — ожидание в очереди, snapshot, compare, build (сборка и выкладка).
export type Steps = Record<string, number>;

export interface BuildRecord {
  job: ClaimedJob;
  outcome: BuildOutcome;
  error: string | null;
  steps: Steps;
  finishedAt: Date;
}

const INSERT_SQL = `INSERT INTO storefront_build (site_id, build, attempt, priority, events, event_at, queued_at,
  started_at, finished_at, outcome, steps, error) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  ON CONFLICT (site_id, build) DO NOTHING`;

export async function recordBuild(db: Queryable, record: BuildRecord): Promise<void> {
  const { job } = record;
  await db.query(INSERT_SQL, [
    job.siteId,
    job.build,
    job.attempt,
    job.priority,
    job.events,
    job.eventAt,
    job.queuedAt,
    job.startedAt,
    record.finishedAt,
    record.outcome,
    JSON.stringify(record.steps),
    record.error,
  ]);
}

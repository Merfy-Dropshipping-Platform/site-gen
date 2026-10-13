import { z } from 'zod';
import { SECTION_ERRORS_QUEUE, type Broker } from './broker';
import type { Log } from './log';
import { parseSectionErrors, type SectionErrorBatch } from './section-errors';
import type { Queryable } from './shop-state';

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

// Для автостопа выпуска (блок 10): строка на выпуск секции — сколько магазинов и ошибок с минуты since.
export async function sectionErrorSummary(db: Queryable, since: Date): Promise<SectionErrorSummaryRow[]> {
  const { rows } = await db.query(SUMMARY_SQL, [since.toISOString()]);
  return summaryRowSchema.array().parse(rows);
}

// Потребитель очереди шлюза. Негодное сообщение — message-invalid: брокер пишет строку журнала и подтверждает его;
// база недоступна — сообщение вернётся в очередь (broker.ts, deliver).
export async function consumeSectionErrors(deps: SectionErrorDeps): Promise<void> {
  await deps.broker.consume(SECTION_ERRORS_QUEUE, SECTION_ERRORS_PREFETCH, async ({ body }) => {
    const batch = parseSectionErrors(body);
    const recorded = await recordSectionErrors(deps.db, batch);
    deps.log('section-errors', { shopId: batch.shopId, minute: batch.minute, ...recorded });
  });
}

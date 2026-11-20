import { z } from 'zod';
import { AUDIT_LIMITS } from '../checks/audit/compare';
import { BASELINE_AUDITS, medianMetrics } from '../checks/audit/median';
import { AuditMetrics, AuditOpportunity, type AuditReport } from '../checks/audit/report';
import type { CheckFinding } from '../checks/finding';
import type { Queryable } from '../shop-state';
import type { LatestAudit } from './contract';

// Таблица storefront_audit базы sites (drizzle/0037_storefront_audit.sql): строка на магазин, сборку и страницу — итог
// аудита после публикации, сравнение с прошлым и находки «стало хуже». Пишет сборщик, читает он же (для sites и MCP,
// `audit/answer.ts`).

export interface AuditRecord {
  siteId: string;
  build: number;
  path: string;
  pageId: string;
  status: 'done' | 'failed';
  reason: string | null;
  report: AuditReport | null;
  // Метрики прошлого аудита той же страницы, с которыми сравнивали; нет прошлого — null.
  previous: AuditMetrics | null;
  findings: readonly CheckFinding[];
  measuredAt: string;
}

// Прошлые аудиты той же страницы — последние удавшиеся из более ранних сборок: их медиана — база сравнения.
const PREVIOUS_SQL = `
SELECT perf, lcp_ms AS "lcpMs", fcp_ms AS "fcpMs", tbt_ms AS "tbtMs", cls, si_ms AS "siMs"
FROM storefront_audit
WHERE site_id = $1 AND path = $2 AND status = 'done' AND build < $3
ORDER BY measured_at DESC
LIMIT ${BASELINE_AUDITS}`;

const RECORD_SQL = `
INSERT INTO storefront_audit (site_id, build, path, page_id, status, reason, perf, lcp_ms, fcp_ms, tbt_ms, cls, si_ms,
  lcp_element, lcp_section, opportunities, previous, findings, measured_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
ON CONFLICT (site_id, build, path) DO UPDATE SET page_id = EXCLUDED.page_id, status = EXCLUDED.status,
  reason = EXCLUDED.reason, perf = EXCLUDED.perf, lcp_ms = EXCLUDED.lcp_ms, fcp_ms = EXCLUDED.fcp_ms,
  tbt_ms = EXCLUDED.tbt_ms, cls = EXCLUDED.cls, si_ms = EXCLUDED.si_ms, lcp_element = EXCLUDED.lcp_element,
  lcp_section = EXCLUDED.lcp_section, opportunities = EXCLUDED.opportunities, previous = EXCLUDED.previous,
  findings = EXCLUDED.findings, measured_at = EXCLUDED.measured_at`;

const LATEST_SQL = `
SELECT build, path, status, reason, perf, lcp_ms AS "lcpMs", fcp_ms AS "fcpMs", tbt_ms AS "tbtMs", cls, si_ms AS "siMs",
  lcp_element AS "lcpElement", lcp_section AS "lcpSection", opportunities, previous, findings, measured_at AS "measuredAt"
FROM storefront_audit
WHERE site_id = $1 AND page_id = $2
ORDER BY measured_at DESC
LIMIT 1`;

// База сравнения — медиана метрик последних трёх аудитов страницы (один прошлый шумный замер не должен решать); аудитов
// не было — null.
export async function previousMetrics(
  db: Queryable,
  siteId: string,
  path: string,
  build: number,
): Promise<AuditMetrics | null> {
  const { rows } = await db.query(PREVIOUS_SQL, [siteId, path, build]);
  const past = z.array(AuditMetrics).parse(rows);
  return past.length === 0 ? null : medianMetrics(past);
}

const NEWER_BUILD_SQL = `
SELECT 1 FROM storefront_build WHERE site_id = $1 AND build > $2 AND outcome = 'live' LIMIT 1`;

// Вышла ли после сборки `build` новая живая сборка магазина. Строка сборки пишется сразу после выкладки, а проверка
// идёт через секунды после постановки аудита: гонки, из-за которой вытеснение пропустили бы, нет — худшее, что бывает,
// аудит страницы выполнится зря.
export async function newerLiveBuild(db: Queryable, siteId: string, build: number): Promise<boolean> {
  const { rows } = await db.query(NEWER_BUILD_SQL, [siteId, build]);
  return rows.length > 0;
}

// Числа в колонках времени — целые мс.
const ms = (value: number | undefined): number | null => (value === undefined ? null : Math.round(value));

function metricColumns(report: AuditReport | null): Array<number | null> {
  const metrics = report?.metrics;
  return [
    metrics?.perf ?? null,
    ms(metrics?.lcpMs),
    ms(metrics?.fcpMs),
    ms(metrics?.tbtMs),
    metrics?.cls ?? null,
    ms(metrics?.siMs),
  ];
}

export async function recordAudit(db: Queryable, record: AuditRecord): Promise<void> {
  await db.query(RECORD_SQL, [
    record.siteId,
    record.build,
    record.path,
    record.pageId,
    record.status,
    record.reason,
    ...metricColumns(record.report),
    record.report?.lcp?.where ?? null,
    record.report?.lcp?.section ?? null,
    JSON.stringify(record.report?.opportunities ?? []),
    record.previous === null ? null : JSON.stringify(record.previous),
    JSON.stringify(record.findings),
    record.measuredAt,
  ]);
}

const latestRow = z.object({
  build: z.coerce.number().int(),
  path: z.string(),
  status: z.enum(['done', 'failed']),
  reason: z.string().nullable(),
  perf: z.number().nullable(),
  lcpMs: z.number().nullable(),
  fcpMs: z.number().nullable(),
  tbtMs: z.number().nullable(),
  cls: z.number().nullable(),
  siMs: z.number().nullable(),
  lcpElement: z.string().nullable(),
  lcpSection: z.string().nullable(),
  opportunities: z.array(AuditOpportunity),
  previous: AuditMetrics.nullable(),
  findings: z.array(z.unknown()),
  measuredAt: z.date(),
});

type LatestRow = z.infer<typeof latestRow>;

function metricsOf(row: LatestRow): AuditMetrics | null {
  const { perf, lcpMs, fcpMs, tbtMs, cls, siMs } = row;
  if (perf === null || lcpMs === null || fcpMs === null || tbtMs === null || cls === null || siMs === null) return null;
  return { perf, lcpMs, fcpMs, tbtMs, cls, siMs };
}

const lcpOf = (row: LatestRow): LatestAudit['lcp'] =>
  row.lcpElement === null ? null : { where: row.lcpElement, section: row.lcpSection };

export async function latestAudit(db: Queryable, siteId: string, pageId: string): Promise<LatestAudit | null> {
  const { rows } = await db.query(LATEST_SQL, [siteId, pageId]);
  const [row] = z.array(latestRow).parse(rows);
  if (row === undefined) return null;
  return {
    build: row.build,
    path: row.path,
    status: row.status,
    reason: row.reason,
    measuredAt: row.measuredAt.toISOString(),
    metrics: metricsOf(row),
    lcp: lcpOf(row),
    opportunities: row.opportunities,
    previous: row.previous,
    limits: AUDIT_LIMITS,
    findings: row.findings,
  };
}

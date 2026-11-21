import { z } from 'zod';
import { AuditMetrics } from '../checks/audit/report';
import type { Queryable } from '../shop-state';
import { forMerchant, isRegression } from './regressed';

// Сводка последней проверенной публикации магазина: страницы последней сборки, у которой аудит отработал, и вердикт «стало
// хуже» по тому же правилу, что у события (`audit/regressed.ts`). Для шлюза и плашки в конструкторе; только чтение.

const SUMMARY_SQL = `
SELECT build, path, page_id AS "pageId", perf, lcp_ms AS "lcpMs", fcp_ms AS "fcpMs", tbt_ms AS "tbtMs", cls,
  si_ms AS "siMs", previous, findings, measured_at AS "measuredAt"
FROM storefront_audit
WHERE site_id = $1 AND status = 'done'
  AND build = (SELECT max(build) FROM storefront_audit WHERE site_id = $1 AND status = 'done')
ORDER BY path`;

// Находка читается только по `fix`: остальные поля отдаются как лежат в строке.
const summaryRow = z.object({
  build: z.coerce.number().int(),
  path: z.string(),
  pageId: z.string(),
  perf: z.number(),
  lcpMs: z.number(),
  fcpMs: z.number(),
  tbtMs: z.number(),
  cls: z.number(),
  siMs: z.number(),
  previous: AuditMetrics.nullable(),
  findings: z.array(z.looseObject({ fix: z.string() })),
  measuredAt: z.date(),
});

type SummaryRow = z.infer<typeof summaryRow>;

export interface AuditSummaryPage {
  path: string;
  pageId: string;
  metrics: AuditMetrics;
  previous: AuditMetrics | null;
  // Находки без платформенных: их чинит платформа, мерчанту они не показываются.
  findings: SummaryRow['findings'];
}

export interface AuditSummary {
  build: number;
  // Когда закончен последний аудит сборки (ISO).
  measuredAt: string;
  regressed: boolean;
  pages: AuditSummaryPage[];
}

const pageOf = ({ path, pageId, perf, lcpMs, fcpMs, tbtMs, cls, siMs, previous, findings }: SummaryRow) => ({
  path,
  pageId,
  metrics: { perf, lcpMs, fcpMs, tbtMs, cls, siMs },
  previous,
  findings: forMerchant(findings),
});

const latestOf = (rows: readonly SummaryRow[]): Date =>
  new Date(Math.max(...rows.map((row) => row.measuredAt.getTime())));

// Строки одной сборки → сводка; строк нет — null.
export function summaryOf(rows: readonly SummaryRow[]): AuditSummary | null {
  const [first] = rows;
  if (first === undefined) return null;
  return {
    build: first.build,
    measuredAt: latestOf(rows).toISOString(),
    regressed: rows.some((row) => isRegression('done', row.findings)),
    pages: rows.map(pageOf),
  };
}

export async function latestSummary(db: Queryable, siteId: string): Promise<AuditSummary | null> {
  const { rows } = await db.query(SUMMARY_SQL, [siteId]);
  return summaryOf(z.array(summaryRow).parse(rows));
}

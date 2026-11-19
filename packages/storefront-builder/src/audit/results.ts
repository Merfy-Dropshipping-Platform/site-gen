import type { Broker } from '../broker';
import { auditFindings } from '../checks/audit/compare';
import type { AuditMetrics, AuditReport } from '../checks/audit/report';
import { onPlatformSections, type CheckFinding } from '../checks/finding';
import type { Log } from '../log';
import type { Queryable } from '../shop-state';
import { AUDIT_RESULTS_QUEUE, parseAuditResult, type AuditResult } from './contract';
import { previousMetrics, recordAudit } from './store';

// Ответ проверяющего процесса по аудиту страницы (`audit/contract.ts`): сравнить с прошлым аудитом той же страницы и
// записать строку (`audit/store.ts`). «Не отработал» тоже строка — агент видит причину, а не тишину.

export interface AuditResultDeps {
  db: Queryable;
  // Какие из секций (полные имена `data-section`) в магазине — неизменённые библиотечные, то есть платформы
  // (`libraryUnchanged` пакета storefront-sections): их находки чинит платформа, а не агент.
  library: (siteId: string, names: readonly string[]) => Promise<ReadonlySet<string>>;
  log: Log;
}

// Находки «стало хуже»: прошлого аудита нет — сравнивать не с чем. Находка в секции платформы получает `fix` платформы.
async function findingsOf(
  deps: AuditResultDeps,
  result: AuditResult,
  report: AuditReport,
  previous: AuditMetrics | null,
): Promise<CheckFinding[]> {
  if (previous === null) return [];
  const { path } = result;
  const found = auditFindings({
    path,
    was: previous,
    now: report.metrics,
    lcp: report.lcp,
    opportunities: report.opportunities,
  });
  const { lcp } = report;
  if (lcp === null || lcp.section === null || lcp.name === null) return found;
  const library = await deps.library(result.siteId, [lcp.name]);
  return onPlatformSections(found, library.has(lcp.name) ? new Set([lcp.section]) : new Set());
}

export async function onAuditResult(deps: AuditResultDeps, result: AuditResult): Promise<void> {
  const { siteId, build, path, pageId, status, reason, report, measuredAt } = result;
  const previous = report === null ? null : await previousMetrics(deps.db, siteId, path, build);
  const findings = report === null ? [] : await findingsOf(deps, result, report, previous);
  await recordAudit(deps.db, { siteId, build, path, pageId, status, reason, report, previous, findings, measuredAt });
  deps.log('audit-recorded', {
    shopId: siteId,
    buildId: build,
    path,
    status,
    perf: report?.metrics.perf ?? null,
    lcpMs: report === null ? null : Math.round(report.metrics.lcpMs),
    worse: findings.length,
    error: reason,
  });
}

// Ответы — по одному: запись и сравнение идут в порядке прихода, прошлый аудит страницы к ответу уже записан.
export async function consumeAuditResults(broker: Pick<Broker, 'consume'>, deps: AuditResultDeps): Promise<void> {
  await broker.consume(AUDIT_RESULTS_QUEUE, 1, async ({ body }) => {
    await onAuditResult(deps, parseAuditResult(body));
  });
}

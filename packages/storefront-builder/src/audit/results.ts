import type { Broker } from '../broker';
import { auditFindings, type AuditChange } from '../checks/audit/compare';
import { SERIES_RUNS, medianReport } from '../checks/audit/median';
import type { AuditMetrics, AuditReport } from '../checks/audit/report';
import { onPlatformSections, type CheckFinding } from '../checks/finding';
import { errorText } from '../errors';
import type { Log } from '../log';
import type { Queryable } from '../shop-state';
import { AUDIT_RESULTS_QUEUE, parseAuditResult, type AuditJob, type AuditResult } from './contract';
import { announceRegressed, type PublishRegressed } from './regressed';
import { previousMetrics, recordAudit } from './store';

// Ответ проверяющего процесса по аудиту страницы (`audit/contract.ts`): сравнить с прошлыми аудитами той же страницы и
// записать строку (`audit/store.ts`). «Не отработал» тоже строка — агент видит причину, а не тишину.
//
// Стало хуже для мерчанта (находка не платформы) — итоговая строка, не перемер, уходит событием во внутренний брокер
// (`audit/regressed.ts`); сбой брокера записи не ломает.
//
// Шум: один прогон Lighthouse врёт, поэтому правила считаются по медиане трёх прогонов. Сработало правило на первом
// прогоне — страницу перемеряют ещё дважды (задание с уже снятыми прогонами уходит в ту же очередь аудита, то есть с тем
// же низким приоритетом), и строка пишется по медиане. База сравнения — медиана последних трёх аудитов страницы.

export interface AuditResultDeps {
  db: Queryable;
  // Поставить задание аудита (перемер).
  publishAudit: (job: AuditJob) => Promise<void>;
  // Сообщить, что после публикации стало хуже (`audit/regressed.ts`): только итоговая строка, перемеры — нет.
  publishRegressed: PublishRegressed;
  log: Log;
}

// Прогоны серии вместе с этим ответом; «не отработал» после удавшихся прогонов серию не обрывает.
const samplesOf = (result: AuditResult): AuditReport[] => [
  ...(result.job?.samples ?? []),
  ...(result.report === null ? [] : [result.report]),
];

const changeOf = (path: string, was: AuditMetrics, report: AuditReport): AuditChange => ({
  path,
  was,
  now: report.metrics,
  lcp: report.lcp,
  opportunities: report.opportunities,
});

// Находки «стало хуже»: прошлых аудитов нет — сравнивать не с чем. Находка в секции платформы получает `fix` платформы:
// платформенные секции — те, что остались библиотечными в исходниках этой сборки (`job.platform`).
function findingsOf(result: AuditResult, report: AuditReport, baseline: AuditMetrics | null): CheckFinding[] {
  if (baseline === null) return [];
  const found = auditFindings(changeOf(result.path, baseline, report));
  const { lcp } = report;
  if (lcp === null || lcp.section === null || lcp.name === null) return found;
  const platform = new Set(result.job?.platform ?? []);
  return onPlatformSections(found, platform.has(lcp.name) ? new Set([lcp.section]) : new Set());
}

// Нужен ли ещё прогон: серия уже идёт, либо на первом прогоне сработало правило.
function needsMore(result: AuditResult, samples: readonly AuditReport[], baseline: AuditMetrics | null): boolean {
  const [first] = samples;
  if (result.job === undefined || result.report === null || baseline === null || first === undefined) return false;
  if (samples.length >= SERIES_RUNS) return false;
  return samples.length > 1 || auditFindings(changeOf(result.path, baseline, first)).length > 0;
}

// Ставит перемер; true — ответ не записывается, строка будет после серии. Не поставился — пишем по тому, что есть.
async function remeasure(
  deps: AuditResultDeps,
  result: AuditResult,
  samples: readonly AuditReport[],
  baseline: AuditMetrics | null,
): Promise<boolean> {
  const { job } = result;
  if (job === undefined || !needsMore(result, samples, baseline)) return false;
  const fields = { shopId: result.siteId, buildId: result.build, path: result.path, run: samples.length + 1 };
  try {
    await deps.publishAudit({ ...job, samples: [...samples] });
    deps.log('audit-remeasure', fields);
    return true;
  } catch (error) {
    deps.log('audit-remeasure-failed', { ...fields, error: errorText(error) });
    return false;
  }
}

// Что записать: удавшиеся прогоны серии — строка по их медиане; ни одного — «не отработал» с причиной ответа.
function outcomeOf(result: AuditResult, samples: readonly AuditReport[], baseline: AuditMetrics | null) {
  if (samples.length === 0) return { report: null, findings: [], status: result.status, reason: result.reason };
  const report = medianReport(samples);
  return { report, findings: findingsOf(result, report, baseline), status: 'done' as const, reason: null };
}

export async function onAuditResult(deps: AuditResultDeps, result: AuditResult): Promise<void> {
  const { siteId, build, path, pageId, measuredAt } = result;
  const samples = samplesOf(result);
  const baseline = samples.length === 0 ? null : await previousMetrics(deps.db, siteId, path, build);
  if (await remeasure(deps, result, samples, baseline)) return;
  const { report, findings, status, reason } = outcomeOf(result, samples, baseline);
  const row = { siteId, build, path, pageId, status, reason, report, previous: baseline, findings, measuredAt };
  await recordAudit(deps.db, row);
  await announceRegressed(deps, row);
  deps.log('audit-recorded', {
    shopId: siteId,
    buildId: build,
    path,
    status,
    runs: samples.length,
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

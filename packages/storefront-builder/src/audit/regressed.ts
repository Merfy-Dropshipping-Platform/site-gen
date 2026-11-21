import type { AuditMetrics, AuditReport } from '../checks/audit/report';
import type { CheckFinding } from '../checks/finding';
import { errorText } from '../errors';
import type { Log } from '../log';
import type { Queryable } from '../shop-state';
import { tenantOf, type AuditRecord } from './store';

// Событие «стало хуже после публикации»: сборщик → точка обмена storefront.audit (fanout, durable) → шлюз, который
// сообщает мерчанту (этап 5b, контракт Ч1). Источник один — итоговая строка аудита страницы (`audit/results.ts`);
// перемеры событий не дают. Сбой отправки — строка журнала: запись аудита уже сделана, сообщение не возвращается в очередь.

export const AUDIT_EXCHANGE = 'storefront.audit';

// «Стало хуже для мерчанта» (одно правило для события, сводки и плашки): аудит отработал и есть находка не платформы.
// Находки платформы мерчанту не показываются — их чинит платформа.
export const forMerchant = <T extends { fix: string }>(findings: readonly T[]): T[] =>
  findings.filter((finding) => finding.fix !== 'platform');

export const isRegression = (status: AuditRecord['status'], findings: readonly { fix: string }[]): boolean =>
  status === 'done' && forMerchant(findings).length > 0;

export interface AuditRegressed {
  type: 'audit.regressed';
  // Одно событие на (магазин, сборка, страница): повтор доставки получатель отбрасывает по нему.
  eventId: string;
  siteId: string;
  // Организация магазина (site.tenant_id).
  tenantId: string;
  build: number;
  path: string;
  pageId: string;
  measuredAt: string;
  // `publishedBy` (кто нажал публикацию) в событии нет: сборка этого не знает — см. комментарий в `regressedEvent`.
  metrics: AuditMetrics;
  previous: AuditMetrics | null;
  lcp: { element: string | null; section: string | null };
  findings: CheckFinding[];
}

export type PublishRegressed = (event: AuditRegressed) => Promise<void>;

export interface RegressedDeps {
  db: Queryable;
  publishRegressed: PublishRegressed;
  log: Log;
}

const lcpOf = (report: AuditReport): AuditRegressed['lcp'] => ({
  element: report.lcp?.where ?? null,
  section: report.lcp?.section ?? null,
});

// Тело события. Кто нажал публикацию, сборка не знает: событие `merchant-publish` из sites несёт только магазин и
// источник (`events.ts`), строка магазина и строка сборки пользователя не хранят. Поле появится, когда sites положит
// пользователя в событие, а сборщик — в строку магазина и в задание аудита.
export function regressedEvent(row: AuditRecord, report: AuditReport, tenantId: string): AuditRegressed {
  return {
    type: 'audit.regressed',
    eventId: `${row.siteId}:${row.build}:${row.path}`,
    siteId: row.siteId,
    tenantId,
    build: row.build,
    path: row.path,
    pageId: row.pageId,
    measuredAt: row.measuredAt,
    metrics: report.metrics,
    previous: row.previous,
    lcp: lcpOf(report),
    findings: forMerchant(row.findings),
  };
}

export async function announceRegressed(deps: RegressedDeps, row: AuditRecord): Promise<void> {
  const { report } = row;
  if (report === null || !isRegression(row.status, row.findings)) return;
  const fields = { shopId: row.siteId, buildId: row.build, path: row.path };
  try {
    const tenantId = await tenantOf(deps.db, row.siteId);
    await deps.publishRegressed(regressedEvent(row, report, tenantId));
    deps.log('audit-regressed', fields);
  } catch (error) {
    deps.log('audit-regressed-failed', { ...fields, error: errorText(error) });
  }
}

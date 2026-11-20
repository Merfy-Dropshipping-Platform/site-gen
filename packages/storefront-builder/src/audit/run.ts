import type { Broker } from '../broker';
import type { AuditReport } from '../checks/audit/report';
import { errorText } from '../errors';
import { LighthouseYielded } from '../look/look-audit';
import type { Log } from '../log';
import { AUDITS_QUEUE, parseAuditJob, type AuditJob, type AuditResult } from './contract';

// Прогон аудита в проверяющем процессе (`checker/main.ts`): задание из storefront_audits → опубликованная страница в
// Lighthouse → ответ в storefront_audit_results. На страницу — бюджет: не уложился — ответ «не отработал» с причиной.

export interface AuditRunDeps {
  // Lighthouse navigation по адресу; бросает, если не уложился в бюджет или уступил место снимку (`look-audit.ts`).
  measure: (url: string, budgetMs: number) => Promise<AuditReport>;
  fetch: (url: string) => Promise<Response>;
  // Вышла ли после сборки задания новая живая сборка магазина (`GET /api/sites/:id/audit/superseded` sites → сборщик).
  // Сбой ответа — «нет»: аудит идёт, как шёл.
  superseded: (siteId: string, build: number) => Promise<boolean>;
  // Ожидание новой страницы в раздаче: опрос ETag, пока не совпадёт с отпечатком из манифеста; предел — сбой раздачи.
  pollMs: number;
  waitMs: number;
  // Бюджет на страницу целиком: ожидание раздачи, очередь Lighthouse и сам прогон.
  budgetMs: number;
  now: () => Date;
  log: Log;
}

// Сколько раз аудит уступает место снимкам черновика, прежде чем сдаться.
export const MAX_YIELDS = 3;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// ETag слабый (`W/"…"`), когда раздача сжимает ответ: отпечаток тот же.
const etagOf = (response: Response): string | null => response.headers.get('etag')?.replace(/^W\//, '') ?? null;

// Не начатое задание, которое вытеснила новая сборка магазина: страница сборки уже заменена другой, измерять нечего.
class AuditSuperseded extends Error {}

// Как часто, пока страница не совпала, спрашиваем у сборщика про новую сборку.
const SUPERSEDED_EVERY_MS = 2_000;

function supersededCheck(deps: AuditRunDeps, job: AuditJob): () => Promise<boolean> {
  let nextAt = 0;
  return async () => {
    if (Date.now() < nextAt) return false;
    nextAt = Date.now() + SUPERSEDED_EVERY_MS;
    return deps.superseded(job.siteId, job.build).catch(() => false);
  };
}

// Раздача отдаёт новую страницу сборки, а не кэш прошлой, когда ETag страницы равен её отпечатку из манифеста. Страница
// другая, а живая сборка уже новее — задание вытеснено (`AuditSuperseded`): ждать эту страницу незачем. Страница та же —
// аудит нужен, даже если сборка новее: в новой сборке она не менялась и своего аудита не получит.
async function servedProblem(deps: AuditRunDeps, job: AuditJob, deadline: number): Promise<string | null> {
  const wanted = `"${job.hash}"`;
  const newerBuild = supersededCheck(deps, job);
  for (;;) {
    const response = await deps.fetch(job.url).catch(() => null);
    const etag = response === null ? null : etagOf(response);
    if (response?.status === 200 && etag === wanted) return null;
    if (response?.status === 200 && (await newerBuild())) throw new AuditSuperseded();
    if (Date.now() + deps.pollMs >= deadline) {
      return `раздача не сменила страницу на новую сборку за ${Math.round(deps.waitMs / 1000)} с: ETag ${etag ?? 'нет'}, ждали ${wanted}`;
    }
    await wait(deps.pollMs);
  }
}

// Прогон; уступил место снимку черновика — повторяет, пока хватает бюджета и попыток.
async function measured(deps: AuditRunDeps, job: AuditJob, deadline: number, attempt = 1): Promise<AuditReport> {
  try {
    return await deps.measure(job.url, deadline - Date.now());
  } catch (error) {
    if (!(error instanceof LighthouseYielded) || attempt >= MAX_YIELDS) throw error;
    return measured(deps, job, deadline, attempt + 1);
  }
}

async function audited(deps: AuditRunDeps, job: AuditJob, deadline: number): Promise<AuditReport> {
  const stale = await servedProblem(deps, job, Math.min(deadline, Date.now() + deps.waitMs));
  if (stale !== null) throw new Error(stale);
  return measured(deps, job, deadline);
}

const firstLine = (text: string): string => (text.split('\n')[0] ?? '').slice(0, 300);

// Ответ по заданию; null — задание вытеснено новой сборкой магазина, ответа нет (прошлый аудит страницы остаётся).
export async function runAuditJob(deps: AuditRunDeps, job: AuditJob): Promise<AuditResult | null> {
  const deadline = Date.now() + deps.budgetMs;
  const base = { v: 1 as const, siteId: job.siteId, build: job.build, pageId: job.pageId, path: job.path, job };
  const fields = { shopId: job.siteId, buildId: job.build, path: job.path };
  try {
    const report = await audited(deps, job, deadline);
    deps.log('audit-done', { ...fields, perf: report.metrics.perf, lcpMs: Math.round(report.metrics.lcpMs) });
    return { ...base, status: 'done', reason: null, report, measuredAt: deps.now().toISOString() };
  } catch (error) {
    if (error instanceof AuditSuperseded) {
      deps.log('audit-superseded', fields);
      return null;
    }
    const reason = firstLine(errorText(error));
    deps.log('audit-failed', { ...fields, error: reason });
    return { ...base, status: 'failed', reason, report: null, measuredAt: deps.now().toISOString() };
  }
}

// Задания — по одному: Lighthouse в процессе один, а браузер общий со снимками черновика.
export async function consumeAudits(
  broker: Pick<Broker, 'consume' | 'publishAuditResult'>,
  deps: AuditRunDeps,
): Promise<void> {
  await broker.consume(AUDITS_QUEUE, 1, async ({ body }) => {
    const result = await runAuditJob(deps, parseAuditJob(body));
    if (result !== null) await broker.publishAuditResult(result);
  });
}

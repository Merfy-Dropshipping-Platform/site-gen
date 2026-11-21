import { z } from 'zod';
import type { DrawAnswer } from '../draw';
import { errorText } from '../errors';
import type { Log } from '../log';
import type { Queryable } from '../shop-state';
import { jsonAnswer } from '../stand-preview';
import { latestAudit, newerLiveBuild } from './store';
import { latestSummary } from './summary';

// Последний аудит страницы магазина для sites и проверяющего процесса: `GET /audit?shop=<uuid>&page=<id страницы>`.
// Проверяющий процесс кладёт его в ответ снимка (`look`), оттуда его берёт MCP. Только чтение.
export const AUDIT_ROUTE = '/audit';

export interface AuditAnswerDeps {
  db: Queryable;
  log: Log;
}

const TEXT = {
  query: 'нужны shop (uuid) и page',
  none: 'аудита страницы ещё не было',
  failed: 'аудит не прочитан',
} as const;

const querySchema = z.object({ shop: z.uuid(), page: z.string().min(1).max(200) });

// Вытеснено ли задание аудита новой сборкой: `GET /audit/superseded?shop=<uuid>&build=<номер>` → `{ superseded }`.
// Спрашивает проверяющий процесс перед прогоном (через sites, как и последний аудит).
export const AUDIT_SUPERSEDED_ROUTE = '/audit/superseded';

const supersededSchema = z.object({ shop: z.uuid(), build: z.coerce.number().int().positive() });

export async function supersededAnswer(
  deps: AuditAnswerDeps,
  rawShop: string | null,
  rawBuild: string | null,
): Promise<DrawAnswer> {
  const query = supersededSchema.safeParse({ shop: rawShop, build: rawBuild });
  if (!query.success) return jsonAnswer(400, { problems: ['нужны shop (uuid) и build'] });
  try {
    return jsonAnswer(200, { superseded: await newerLiveBuild(deps.db, query.data.shop, query.data.build) });
  } catch (error) {
    deps.log('audit-superseded-read-failed', { shopId: query.data.shop, error: errorText(error) });
    return jsonAnswer(500, { problems: [TEXT.failed] });
  }
}

// Сводка последней проверенной публикации магазина: `GET /audit/latest?shop=<uuid>` → `{ build, measuredAt, regressed,
// pages }` (`audit/summary.ts`). Для шлюза и плашки в конструкторе. Аудита ещё не было — 404.
export const AUDIT_LATEST_ROUTE = '/audit/latest';

const shopSchema = z.object({ shop: z.uuid() });

export async function summaryAnswer(deps: AuditAnswerDeps, rawShop: string | null): Promise<DrawAnswer> {
  const query = shopSchema.safeParse({ shop: rawShop });
  if (!query.success) return jsonAnswer(400, { problems: ['нужен shop (uuid)'] });
  try {
    const summary = await latestSummary(deps.db, query.data.shop);
    return summary === null ? jsonAnswer(404, { problems: [TEXT.none] }) : jsonAnswer(200, summary);
  } catch (error) {
    deps.log('audit-summary-read-failed', { shopId: query.data.shop, error: errorText(error) });
    return jsonAnswer(500, { problems: [TEXT.failed] });
  }
}

export async function auditAnswer(
  deps: AuditAnswerDeps,
  rawShop: string | null,
  rawPage: string | null,
): Promise<DrawAnswer> {
  const query = querySchema.safeParse({ shop: rawShop, page: rawPage });
  if (!query.success) return jsonAnswer(400, { problems: [TEXT.query] });
  try {
    const audit = await latestAudit(deps.db, query.data.shop, query.data.page);
    return audit === null ? jsonAnswer(404, { problems: [TEXT.none] }) : jsonAnswer(200, audit);
  } catch (error) {
    deps.log('audit-read-failed', { shopId: query.data.shop, page: query.data.page, error: errorText(error) });
    return jsonAnswer(500, { problems: [TEXT.failed] });
  }
}

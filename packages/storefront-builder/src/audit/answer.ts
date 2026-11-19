import { z } from 'zod';
import type { DrawAnswer } from '../draw';
import { errorText } from '../errors';
import type { Log } from '../log';
import type { Queryable } from '../shop-state';
import { jsonAnswer } from '../stand-preview';
import { latestAudit } from './store';

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

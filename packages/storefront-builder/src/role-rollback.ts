import { randomUUID } from 'node:crypto';
import { rollbackBroken, type BrokenRollback } from '@merfy/storefront-sections';
import { z } from 'zod';
import type { PublishActivity } from './alert';
import { errorText } from './errors';
import type { ContentEvent } from './events';
import type { Log } from './log';
import { SECTION_ERROR_LIMIT, type AfterCounted, type RoleErrorCount } from './section-error-store';
import type { Database } from './shop-state';

// Откат секции с ролью по ошибкам из браузеров (блок 12 «Секций и SDK», часть 12в; design.md блока 12, В12-1 А). После
// записи пачки (section-error-store.ts, recordCounted): секция с ролью на витрине, ошибок её скрипта за окно не меньше
// порога → откат под замком владельца (rollbackBroken) → пересборка магазина событием section-rollback → запись
// в журнал платформы, как у автостопа выпуска (release/alert.ts). Отката нет (прежней правки нет, у неё другая роль,
// роль занята) — только запись в журнал, один раз: на пачке, которая перешла порог. Обычные секции сюда не приходят.
export const SECTION_ROLLBACK_EVENT = 'section-rollback';
const SOURCE = 'storefront-section-errors';
const CATEGORY = 'site';
const tenantRow = z.object({ tenant_id: z.string() });

export interface RoleRollbackDeps {
  db: Database;
  publishEvent: (event: ContentEvent) => Promise<void>;
  publishActivity: PublishActivity;
  clock: () => Date;
  log: Log;
}

type Reported = Exclude<BrokenRollback, { status: 'stale' }>;

// Текст для мерчанта; ИИ видит ту же ошибку в «правках секции» (блок 14).
export function rollbackText(count: RoleErrorCount, outcome: BrokenRollback): string {
  const broken = `В секции «${count.title}» ошибка — ${count.message}.`;
  switch (outcome.status) {
    case 'rolled-back':
      return `Секция «${count.title}» вернулась к прежней версии: в новой ошибка — ${count.message}`;
    case 'no-previous':
      return `${broken} Прежней версии нет: исправьте секцию`;
    case 'role-changed':
      return `${broken} Прежнюю версию не вернули: у неё другая роль`;
    case 'role-taken':
      return `${broken} Прежнюю версию не вернули: роль ${count.role} занята секцией ${outcome.holder}`;
    case 'cooldown':
      return `${broken} Прежнюю версию не вернули: секцию с этой ролью уже возвращали за последние сутки`;
    case 'stale':
      return '';
  }
}

function metaOf(count: RoleErrorCount, outcome: Reported) {
  const { section, role, scriptHash, errors, stage, message } = count;
  const to = 'to' in outcome ? outcome.to.id : null;
  const holder = outcome.status === 'role-taken' ? outcome.holder : null;
  const text = rollbackText(count, outcome);
  const from = outcome.from.id;
  return { section, role, scriptHash, errors, stage, message, reason: outcome.status, from, to, holder, text };
}

// Конверт журнала платформы — как у release_stopped (release/alert.ts); organizationId — организация магазина.
function envelopeOf(shopId: string, organizationId: string, count: RoleErrorCount, outcome: Reported, at: string) {
  const rolledBack = outcome.status === 'rolled-back';
  return {
    schemaVersion: 1,
    eventId: randomUUID(),
    occurredAt: at,
    sourceService: 'storefront-builder',
    category: CATEGORY,
    action: rolledBack ? 'section_rolled_back' : 'section_broken',
    severity: rolledBack ? 'warning' : 'critical',
    organizationId,
    siteId: shopId,
    actorType: 'system',
    actorUserId: null,
    objectType: 'site',
    objectId: shopId,
    objectRef: null,
    payload: { meta: metaOf(count, outcome) },
  };
}

async function notify(deps: RoleRollbackDeps, shopId: string, count: RoleErrorCount, outcome: Reported) {
  const { rows } = await deps.db.query('SELECT tenant_id FROM site WHERE id = $1', [shopId]);
  const organizationId = rows.map((row) => tenantRow.parse(row).tenant_id).at(0) ?? shopId;
  const envelope = envelopeOf(shopId, organizationId, count, outcome, deps.clock().toISOString());
  await deps.publishActivity(`${CATEGORY}.${envelope.action}`, envelope);
}

// Сбой отправки — строка журнала, сообщение очереди не возвращается: откат уже записан, повтор увидел бы stale.
// Потерянную пересборку доносит сверка раз в час (свой код магазина — в ключе данных, reconcile.ts).
async function safely(deps: RoleRollbackDeps, shopId: string, what: string, send: () => Promise<void>) {
  try {
    await send();
  } catch (error) {
    deps.log('section-rollback-publish-failed', { shopId, what, error: errorText(error) });
  }
}

const rebuildEvent = (deps: RoleRollbackDeps, siteId: string): ContentEvent => ({
  type: SECTION_ROLLBACK_EVENT,
  siteId,
  eventAt: deps.clock().toISOString(),
  source: SOURCE,
});

// Откат — запись всегда; пауза после отката — раз в сутки на магазин и роль (решил rollbackBroken); остальное — на
// пачке, которая перешла порог: о следующих пачках той же ошибки уже записано.
function worthNotice(outcome: Reported, count: RoleErrorCount): boolean {
  if (outcome.status === 'rolled-back') return true;
  if (outcome.status === 'cooldown') return outcome.notify;
  return count.before < SECTION_ERROR_LIMIT;
}

async function report(deps: RoleRollbackDeps, shopId: string, count: RoleErrorCount, outcome: BrokenRollback) {
  const fields = { shopId, section: count.section, role: count.role, errors: count.errors, outcome: outcome.status };
  if (outcome.status === 'stale') {
    deps.log('section-rollback-stale', fields);
    return;
  }
  const reported: Reported = outcome;
  if (!worthNotice(reported, count)) return;
  if (reported.status === 'rolled-back') {
    deps.log('section-rolled-back', { ...fields, from: reported.from.id, to: reported.to.id });
    await safely(deps, shopId, 'event', () => deps.publishEvent(rebuildEvent(deps, shopId)));
  } else {
    deps.log('section-broken', fields);
  }
  await safely(deps, shopId, 'activity', () => notify(deps, shopId, count, reported));
}

export function roleRollback(deps: RoleRollbackDeps): AfterCounted {
  return async (batch, counted) => {
    for (const count of counted.roles.filter((item) => item.errors >= SECTION_ERROR_LIMIT)) {
      const outcome = await rollbackBroken(deps.db, batch.shopId, count.section, count.scriptHash, deps.clock());
      await report(deps, batch.shopId, count, outcome);
    }
  };
}

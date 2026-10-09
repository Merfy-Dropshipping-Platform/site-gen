import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Log } from './log';
import type { Queryable, StartedJob } from './shop-state';

// Тревога (design.md блока 6, В6-4, тревога — вариант 1): магазин упал все запуски и остановлен. Строка ALERT в журнале
// сборщика и запись critical в журнал платформы — точка обмена activity.events (broker.ts), конверт schemaVersion 1, как
// у activity-log.publisher.ts site-gen. Писем, экранов и своих очередей нет.

const CATEGORY = 'site';
const ACTION = 'build_stopped';
const tenantRow = z.object({ tenant_id: z.string() });

export type PublishActivity = (routingKey: string, envelope: Record<string, unknown>) => Promise<void>;

export interface AlertDeps {
  db: Queryable;
  publishActivity: PublishActivity;
  log: Log;
  clock: () => Date;
}

export interface StoppedShop {
  job: StartedJob;
  attempts: number;
  error: string;
}

// Конверт журнала платформы. organizationId — организация магазина (site.tenant_id).
export function alertEnvelope(stopped: StoppedShop, organizationId: string, occurredAt: string) {
  return {
    schemaVersion: 1,
    eventId: randomUUID(),
    occurredAt,
    sourceService: 'storefront-builder',
    category: CATEGORY,
    action: ACTION,
    severity: 'critical',
    organizationId,
    siteId: stopped.job.siteId,
    actorType: 'system',
    actorUserId: null,
    objectType: 'site',
    objectId: stopped.job.siteId,
    objectRef: null,
    payload: { meta: { build: stopped.job.build, attempts: stopped.attempts, error: stopped.error } },
  };
}

export async function raiseAlert(deps: AlertDeps, stopped: StoppedShop): Promise<void> {
  const { siteId, build } = stopped.job;
  deps.log('ALERT', { shopId: siteId, buildId: build, attempts: stopped.attempts, error: stopped.error });
  const { rows } = await deps.db.query('SELECT tenant_id FROM site WHERE id = $1', [siteId]);
  const organizationId = rows.map((row) => tenantRow.parse(row).tenant_id).at(0) ?? siteId;
  const envelope = alertEnvelope(stopped, organizationId, deps.clock().toISOString());
  await deps.publishActivity(`${CATEGORY}.${ACTION}`, envelope);
}

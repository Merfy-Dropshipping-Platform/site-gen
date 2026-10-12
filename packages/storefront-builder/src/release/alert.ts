import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AlertDeps } from '../alert';
import type { ReleaseRow } from './store';

// Автостоп выпуска (design.md блока 10, «Автостоп и журнал выпуска»): строка ALERT в журнале сборщика и запись
// critical в журнал платформы — конверт как у тревоги сборки (alert.ts блока 6), действие release_stopped. Мониторинг
// заглушён (05.10): писем и экранов нет.
const CATEGORY = 'site';
const ACTION = 'release_stopped';
const tenantRow = z.object({ tenant_id: z.string() });

export function releaseStoppedEnvelope(
  release: ReleaseRow,
  siteId: string,
  organizationId: string,
  reason: string,
  occurredAt: string,
) {
  const { id, kind, subject, fromVersion, toVersion, wave } = release;
  return {
    schemaVersion: 1,
    eventId: randomUUID(),
    occurredAt,
    sourceService: 'storefront-builder',
    category: CATEGORY,
    action: ACTION,
    severity: 'critical',
    organizationId,
    siteId,
    actorType: 'system',
    actorUserId: null,
    objectType: 'site',
    objectId: siteId,
    objectRef: null,
    payload: { meta: { release: id, kind, subject, from: fromVersion, to: toVersion, wave, reason } },
  };
}

export async function raiseReleaseStopped(
  deps: AlertDeps,
  release: ReleaseRow,
  siteId: string,
  reason: string,
): Promise<void> {
  deps.log('ALERT', { release: release.id, kind: release.kind, to: release.toVersion, shopId: siteId, reason });
  const { rows } = await deps.db.query('SELECT tenant_id FROM site WHERE id = $1', [siteId]);
  const organizationId = rows.map((row) => tenantRow.parse(row).tenant_id).at(0) ?? siteId;
  const envelope = releaseStoppedEnvelope(release, siteId, organizationId, reason, deps.clock().toISOString());
  await deps.publishActivity(`${CATEGORY}.${ACTION}`, envelope);
}

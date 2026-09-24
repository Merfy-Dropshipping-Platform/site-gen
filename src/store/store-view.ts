/**
 * Вид магазина в ответах команд и запроса `StoreStatus` (этап 3).
 *
 * Состояние рождения — отдельным объектом `lifecycle`: у старых магазинов
 * (рождённых до саги) оно пустое (`state: null`) — их ведут старые cron, это не
 * ошибка (И7).
 */
import type { LifecycleRow } from "./lifecycle/lifecycle.repository";
import type { LifecycleState } from "./lifecycle/store-lifecycle";

export interface StoreLifecycleView {
  state: LifecycleState | null;
  error: string | null;
  attempts: number;
  /** ISO-время следующей попытки доводчика (или конца его аренды). */
  nextAt: string | null;
}

export interface StoreView {
  id: string;
  tenantId: string;
  name: string;
  slug: string | null;
  themeId: string | null;
  status: string;
  publicUrl: string | null;
  lifecycle: StoreLifecycleView;
}

export function toStoreView(row: LifecycleRow): StoreView {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    slug: row.slug,
    themeId: row.themeId,
    status: row.status,
    publicUrl: row.publicUrl,
    lifecycle: {
      state: row.lifecycle,
      error: row.lifecycleError,
      attempts: row.lifecycleAttempts ?? 0,
      nextAt: row.lifecycleNextAt ? row.lifecycleNextAt.toISOString() : null,
    },
  };
}

/**
 * Перевод старых магазинов в сагу (этап 3, кусок 3.8). Старые магазины (`lifecycle IS NULL`) ведут старые cron,
 * доводчик их не трогает (И7). Переводим только готовые по фактам — тем же правилом, что у доводчика: для них
 * перевод — только учёт. Неготовые остаются старым cron; их перевод запустил бы шаги саги — это решает владелец.
 */
import type { LifecycleRow } from "./lifecycle.repository";
import { observeLifecycle, type LifecycleStep } from "./store-lifecycle";
import { factsOf } from "./store-lifecycle.reconciler";

export type AdoptDecision =
  | { siteId: string; name: string; action: "adopt" }
  | { siteId: string; name: string; action: "skip"; reason: "already_in_saga" }
  | { siteId: string; name: string; action: "skip"; reason: "not_ready"; missing: LifecycleStep };

export function planAdoption(
  rows: readonly LifecycleRow[],
  projectRequired: boolean,
): AdoptDecision[] {
  return rows.map((row) => decide(row, projectRequired));
}

function decide(row: LifecycleRow, projectRequired: boolean): AdoptDecision {
  const base = { siteId: row.id, name: row.name };
  if (row.lifecycle !== null) return { ...base, action: "skip", reason: "already_in_saga" };
  const { next } = observeLifecycle(factsOf(row, projectRequired));
  return next === null
    ? { ...base, action: "adopt" }
    : { ...base, action: "skip", reason: "not_ready", missing: next };
}

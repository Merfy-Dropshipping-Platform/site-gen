/**
 * Кто пишет в черновик магазина — признак, который шлюз ставит по сессии
 * (этап 3 спеки «Запись Визи в черновик nova», К1). Из тела и `meta` клиента
 * автор не читается никогда: sites принимает только поле `writer` RPC.
 *
 *   merchant — мерчант в конструкторе (нет поля — тоже он, как до этапа 3);
 *   agent    — агент через MCP;
 *   vizi     — Визи (агент с `act.sub = "vizi"`).
 */
import { z } from "zod";
import type { WriteActor, WriteSource } from "./store-content.port";

export const WRITERS = ["merchant", "agent", "vizi"] as const;
export type Writer = (typeof WRITERS)[number];

/** Поле `writer` в RPC: нет — мерчант; неизвестное значение — отказ, а не молчаливый мерчант. */
export const WriterSchema = z.enum(WRITERS).optional();

export interface WriteLabels {
  actor: WriteActor;
  source: WriteSource;
}

/** Метки записи агентов: автор и источник в `meta` ревизии. */
const AGENT_LABELS: Record<Exclude<Writer, "merchant">, WriteLabels> = {
  agent: { actor: "agent", source: "mcp" },
  vizi: { actor: "agent", source: "vizi" },
};

/**
 * Метки записи по автору. Агент ставит свои метки поверх любого пути записи
 * (откат, страницы, смена темы, заготовка); мерчант оставляет метки пути
 * (`own`: у конструктора `merchant/constructor`, у отката `merchant/rollback`).
 */
export function labelsOf(
  writer: Writer | undefined,
  own: WriteLabels,
): WriteLabels {
  return writer === undefined || writer === "merchant"
    ? own
    : AGENT_LABELS[writer];
}

/** Мерчант из конструктора — метки по умолчанию `sites.revisions.create`. */
export const CONSTRUCTOR_LABELS: WriteLabels = {
  actor: "merchant",
  source: "constructor",
};

/** Проверка поля `writer` из RPC: `invalid_writer`, если значение не из таблицы. */
export function parseWriter(value: unknown): Writer | undefined {
  const parsed = WriterSchema.safeParse(value);
  if (!parsed.success) throw new Error("invalid_writer");
  return parsed.data;
}

/**
 * Обвязка «отменить записи агента с ревизии R» (`undo-agent.ts`) с базой:
 * цепочка ревизий после R, одна версия формата, запись одной новой ревизии.
 *
 *   1. Текущая — свежим чтением указателя (на повторе — снова).
 *   2. R — ревизия магазина; снимок клиента разворачивается в свою
 *      ревизию-слияние (`meta.snapshotOf`): агент мог получить его id в ответе.
 *   3. Цепочка — версии магазина из истории между R и текущей (не больше
 *      `UNDO_CHAIN_LIMIT`), документы — через модель записи (шаги чтения и
 *      фильтр досеянного, эталон — от текущей), как у слияния.
 *   4. Ничего не поменялось — ничего не пишется (`revisionId: null`).
 *   5. Запись — от базы «текущая» с `reject-conflicts`: кто-то успел записать в
 *      то же место — пересчёт от свежей текущей (`rewriteCurrent`); в другое —
 *      порт сливает сам. Ключ от повторов — как у остальных записей агента.
 */
import { z } from "zod";
import { rewriteCurrent } from "./rewrite-current";
import { undoAgentDocs } from "./undo-agent";
import { CONSTRUCTOR_LABELS, labelsOf } from "./writer";
import type { Writer } from "./writer";
import type { Doc } from "./operations";
import type { WriteModel } from "./write-model";
import {
  CLIENT_SNAPSHOT_KIND,
  RevisionNotFoundError,
} from "./store-content.port";
import type {
  HistoryItem,
  HistoryOptions,
  HistoryPage,
  RevisionEnvelope,
  SaveOnBaseParams,
  SaveResult,
  StoreContentSite,
  UndoAgentParams,
  UndoAgentResult,
  UndoScope,
  WriteSource,
} from "./store-content.port";

/** Сколько версий после R отмена готова пройти: дальше — отказ, а не долгий пересчёт. */
export const UNDO_CHAIN_LIMIT = 500;

/** `scope` из RPC: секции `{ page, id }`, не больше 50; неверная форма — отказ. */
const UndoScopeSchema = z
  .object({
    sections: z
      .array(z.object({ page: z.string().min(1), id: z.string().min(1) }))
      .min(1)
      .max(50)
      .optional(),
  })
  .strict()
  .optional();

export function parseUndoScope(value: unknown): UndoScope | undefined {
  const parsed = UndoScopeSchema.safeParse(value ?? undefined);
  if (!parsed.success) throw new Error("invalid_undo_scope");
  return parsed.data;
}

/**
 * Чьи записи отменяются — по автору от шлюза (К1): агент — `mcp`, Визи —
 * `vizi`. Мерчант (или поля нет) — отказ: отменять «записи мерчанта» эта
 * операция не умеет.
 */
export function undoSourceOf(writer: Writer | undefined): WriteSource {
  const labels = labelsOf(writer, CONSTRUCTOR_LABELS);
  if (labels.actor !== "agent") throw new Error("undo_agent_requires_agent");
  return labels.source;
}

/** Что обвязке нужно от адаптера. */
export interface UndoStore {
  readPointer(siteId: string, tenantId: string): Promise<string | null>;
  history(siteId: string, opts: HistoryOptions): Promise<HistoryPage>;
  envelope(
    siteId: string,
    revisionId: string,
    site: StoreContentSite,
  ): Promise<RevisionEnvelope | null>;
  fetchData(revisionId: string, siteId: string): Promise<Doc | undefined>;
  writeModel(
    siteId: string,
    site: StoreContentSite,
    storedCurrent: Doc | undefined,
  ): Promise<WriteModel>;
  save(siteId: string, params: SaveOnBaseParams): Promise<SaveResult>;
}

/** Что пишется в `meta.undoAgent` ревизии отмены — из него же отвечает повтор. */
interface StoredUndo {
  since: string;
  undone: string[];
  kept: UndoAgentResult["kept"];
}

/** R по id: ревизия этого магазина; снимок клиента — его ревизия-слияние. */
async function resolveSince(
  store: UndoStore,
  siteId: string,
  params: UndoAgentParams,
): Promise<string> {
  const since = params.since;
  const envelope = await store.envelope(siteId, since, params.site);
  if (!envelope) throw new RevisionNotFoundError();
  const meta = envelope.meta ?? {};
  const merged =
    meta.kind === CLIENT_SNAPSHOT_KIND ? meta.snapshotOf : undefined;
  return typeof merged === "string" ? merged : since;
}

/** Версии магазина после R до текущей включительно, по времени. */
async function chainAfter(
  store: UndoStore,
  siteId: string,
  site: StoreContentSite,
  since: string,
  head: string,
): Promise<HistoryItem[]> {
  const page = await store.history(siteId, {
    site,
    limit: UNDO_CHAIN_LIMIT + 1,
  });
  const ids = page.items.map((item) => item.id);
  const headAt = ids.indexOf(head);
  const sinceAt = ids.indexOf(since);
  const inRange = headAt >= 0 && sinceAt > headAt;
  if (!inRange) throw new Error("undo_since_out_of_range");
  return page.items.slice(headAt, sinceAt).reverse();
}

function nothing(
  since: string,
  kept: UndoAgentResult["kept"],
): UndoAgentResult {
  return { revisionId: null, restoredFrom: since, undone: [], kept };
}

/** Повтор по ключу: ответ — из `meta.undoAgent` ревизии, которую записал первый вызов. */
async function replayOf(
  store: UndoStore,
  siteId: string,
  site: StoreContentSite,
  revisionId: string,
): Promise<UndoAgentResult> {
  const envelope = await store.envelope(siteId, revisionId, site);
  const stored = (envelope?.meta?.undoAgent ?? {}) as Partial<StoredUndo>;
  return {
    revisionId,
    restoredFrom: stored.since ?? "",
    undone: stored.undone ?? [],
    kept: stored.kept ?? [],
    replayed: true,
  };
}

async function attempt(
  store: UndoStore,
  siteId: string,
  params: UndoAgentParams,
): Promise<UndoAgentResult> {
  const head = await store.readPointer(siteId, params.tenantId);
  if (head === null) throw new RevisionNotFoundError();
  const since = await resolveSince(store, siteId, params);
  if (since === head) return nothing(since, []);
  const site = { ...params.site, currentRevisionId: head };
  const chain = await chainAfter(store, siteId, site, since, head);
  const raw = await Promise.all(
    [since, ...chain.map((item) => item.id)].map((id) =>
      store.fetchData(id, siteId),
    ),
  );
  const model = await store.writeModel(siteId, site, raw[raw.length - 1]);
  const [sinceDoc, ...docs] = await Promise.all(
    raw.map((doc) => model.normalize(doc)),
  );
  const outcome = undoAgentDocs({
    since: sinceDoc,
    steps: chain.map((item, i) => ({
      author: { actor: item.actor, source: item.source },
      document: docs[i],
    })),
    source: params.source,
    scope: params.scope,
    isAuto: (op, base, side) => model.isAutoValue(op, base, side),
  });
  if (outcome.undone.length === 0) return nothing(since, outcome.kept);

  const undo: StoredUndo = {
    since,
    undone: outcome.undone,
    kept: outcome.kept,
  };
  const saved = await store.save(siteId, {
    mode: "on-base",
    document: outcome.document,
    base: head,
    mergePolicy: "reject-conflicts",
    tenantId: params.tenantId,
    site,
    actor: "agent",
    source: params.source,
    actorUserId: params.actorUserId,
    idempotencyKey: params.idempotencyKey,
    filterSeeded: true,
    meta: {
      restoredFrom: since,
      undoAgent: { ...undo, ...(params.scope ? { scope: params.scope } : {}) },
    },
  });
  if (saved.effect?.replayed)
    return replayOf(store, siteId, site, saved.version);
  return { revisionId: saved.version, restoredFrom: since, ...undo };
}

export function runUndoAgent(
  store: UndoStore,
  siteId: string,
  params: UndoAgentParams,
): Promise<UndoAgentResult> {
  return rewriteCurrent(() => attempt(store, siteId, params));
}

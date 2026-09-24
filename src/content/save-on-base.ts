/**
 * Запись с базой (этап 2, кусок 2.2): алгоритм без SQL, хранилище даёт
 * адаптер (`RevisionStore`).
 *
 *   база = текущая    → быстрая запись с CAS: данные те же, что у записи без
 *                       базы (И7), в `meta` — кто/откуда/база/что (И5);
 *   база устарела     → merge3(база, текущая, входящая) по политике (И2):
 *                       все три документа приведены к одной версии формата
 *                       (шаги чтения) и прошли один фильтр досеянного;
 *                       документ клиента, если он отличается от слитого, —
 *                       снимок-ревизия `meta.kind = 'client-snapshot'`, её id
 *                       — база следующего сохранения клиента (И4);
 *   CAS не прошёл     → свежий указатель и новая попытка (слияние поверх
 *                       записи, успевшей раньше).
 */
import type { Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { VOLATILE_PATHS, apply, diff, merge3, paths } from "./operations";
import type { Op } from "./operations";
import { covers } from "./operations/address";
import { deepEqual } from "./operations/json";
import type { Normalizer } from "./document-normalizer";
import {
  CLIENT_SNAPSHOT_KIND,
  RevisionMergeConflictError,
} from "./store-content.port";
import type { SaveEffect, SaveParams, SaveResult } from "./store-content.port";

type Doc = Record<string, unknown>;

export interface NewRevision {
  id: string;
  data: Doc;
  meta: Record<string, unknown>;
}

/** Что алгоритму нужно от хранилища (адаптера модели контента). */
export interface RevisionStore {
  /** Данные ревизии ЭТОГО магазина; нет такой — `undefined`. */
  fetchData(revisionId: string, siteId: string): Promise<Doc | undefined>;
  /** Указатель текущей ревизии свежим чтением. */
  readPointer(siteId: string, tenantId: string): Promise<string | null>;
  /**
   * Приведение к одной версии формата — дело модели контента: адаптер даёт
   * свои шаги чтения и фильтр досеянного с эталоном от `storedCurrent`.
   */
  normalizer(
    siteId: string,
    params: SaveParams,
    storedCurrent: Doc | undefined,
  ): Promise<Normalizer>;
  /**
   * Одна транзакция: вставить `rows`, переставить указатель на `current`, если
   * он сейчас равен `expected`. `false` — CAS не прошёл, ничего не записано.
   */
  commit(write: {
    siteId: string;
    tenantId: string;
    rows: NewRevision[];
    current: string;
    expected: string | null;
    createdBy?: string;
  }): Promise<boolean>;
}

/** Попыток CAS на одну запись: каждая неудача — свежий указатель и слияние поверх. */
const MAX_ATTEMPTS = 3;

/** Метки записи в `meta` (И5) — только заданные; старые пути без меток не меняются. */
export function writeLabels(params: SaveParams): Record<string, unknown> {
  const labels: Record<string, unknown> = {};
  if (params.actor) labels.actor = params.actor;
  if (params.source) labels.source = params.source;
  return labels;
}

/** Адреса изменений без служебных полей (навигация конструктора — не правка). */
function contentChanges(ops: readonly Op[]): string[] {
  return paths(ops).filter(
    (path) => !VOLATILE_PATHS.some((v) => covers(v, path)),
  );
}

class BaseWrite {
  constructor(
    private readonly store: RevisionStore,
    private readonly siteId: string,
    private readonly params: SaveParams,
    private readonly logger: Logger,
  ) {}

  private get base(): string | null {
    return this.params.base ?? null;
  }

  private get policy() {
    return this.params.mergePolicy ?? "reject-conflicts";
  }

  async run(): Promise<SaveResult> {
    let current = await this.initialPointer();
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const written =
        current === this.base ? await this.fast() : await this.merge(current);
      if (written) return written;
      current = await this.store.readPointer(this.siteId, this.params.tenantId);
    }
    throw new Error("revision_conflict");
  }

  private async initialPointer(): Promise<string | null> {
    const known = this.params.site.currentRevisionId;
    return known !== undefined
      ? known
      : this.store.readPointer(this.siteId, this.params.tenantId);
  }

  private async fetchBase(): Promise<Doc | undefined> {
    if (this.base === null) return undefined;
    const data = await this.store.fetchData(this.base, this.siteId);
    if (data === undefined) throw new Error("base_revision_not_found");
    return data;
  }

  /** Документ пишущего: присланный целиком или операции поверх базы. */
  private async incoming(normalizedBase: () => Promise<Doc>): Promise<Doc> {
    if (this.params.document) return this.params.document;
    if (!this.params.ops) throw new Error("document_or_ops_required");
    return apply(await normalizedBase(), this.params.ops);
  }

  private meta(extra: Record<string, unknown>): Record<string, unknown> {
    return {
      ...(this.params.meta ?? {}),
      ...writeLabels(this.params),
      base: this.base,
      ...extra,
    };
  }

  /** База = текущая: запись как без базы, плюс метки и список изменений. */
  private async fast(): Promise<SaveResult | null> {
    const stored = await this.fetchBase();
    const n = await this.store.normalizer(this.siteId, this.params, stored);
    const incoming = await this.incoming(() => n.normalize(stored));
    const changes = await this.changesBetween(n, stored, incoming);
    const id = randomUUID();
    const ok = await this.commit(
      [{ id, data: n.filterForWrite(incoming), meta: this.meta({ changes }) }],
      id,
      this.base,
    );
    if (!ok) return null;
    const effect: SaveEffect = {
      merged: false,
      clientVersion: id,
      overwritten: [],
      conflicts: [],
      changes,
    };
    return { version: id, effect };
  }

  /** Список изменений не должен ронять запись: не посчитался — `null` и предупреждение. */
  private async changesBetween(
    n: Normalizer,
    stored: Doc | undefined,
    incoming: Doc,
  ): Promise<string[] | null> {
    try {
      return contentChanges(
        diff(await n.normalize(stored), await n.normalize(incoming)),
      );
    } catch (e) {
      this.logger.warn(
        `revision changes not computed for site ${this.siteId}: ${e instanceof Error ? e.message : e}`,
      );
      return null;
    }
  }

  /** База устарела: слияние поверх текущей. */
  private async merge(current: string | null): Promise<SaveResult | null> {
    const stored =
      current === null
        ? undefined
        : await this.store.fetchData(current, this.siteId);
    const baseRaw = await this.fetchBase();
    const n = await this.store.normalizer(this.siteId, this.params, stored);
    const base = await n.normalize(baseRaw);
    const incoming = await n.normalize(await this.incoming(async () => base));
    const result = merge3(
      base,
      await n.normalize(stored),
      incoming,
      this.policy,
    );
    if (!result.merged) throw new RevisionMergeConflictError(result.conflicts);

    const mergedId = randomUUID();
    const snapshotId = deepEqual(result.merged, incoming) ? null : randomUUID();
    const clientVersion = snapshotId ?? mergedId;
    const changes = contentChanges(result.applied);
    const rows: NewRevision[] = [
      ...(snapshotId ? [this.snapshotRow(snapshotId, incoming, mergedId)] : []),
      {
        id: mergedId,
        data: result.merged,
        meta: this.meta({
          changes,
          merge: {
            onto: current,
            clientVersion,
            overwritten: result.overwritten,
          },
        }),
      },
    ];
    if (!(await this.commit(rows, mergedId, current))) return null;
    this.logger.log(
      `revision merged site=${this.siteId} base=${this.base} onto=${current} → ${mergedId} (снимок ${snapshotId ?? "—"}, перезаписано ${result.overwritten.length})`,
    );
    const effect: SaveEffect = {
      merged: true,
      clientVersion,
      overwritten: result.overwritten,
      conflicts: [],
      changes,
    };
    return { version: mergedId, effect };
  }

  private snapshotRow(id: string, data: Doc, mergedId: string): NewRevision {
    return {
      id,
      data,
      meta: {
        kind: CLIENT_SNAPSHOT_KIND,
        ...writeLabels(this.params),
        base: this.base,
        snapshotOf: mergedId,
      },
    };
  }

  private commit(
    rows: NewRevision[],
    current: string,
    expected: string | null,
  ): Promise<boolean> {
    return this.store.commit({
      siteId: this.siteId,
      tenantId: this.params.tenantId,
      rows,
      current,
      expected,
      createdBy: this.params.actorUserId,
    });
  }
}

export function saveOnBase(
  store: RevisionStore,
  siteId: string,
  params: SaveParams,
  logger: Logger,
): Promise<SaveResult> {
  return new BaseWrite(store, siteId, params, logger).run();
}

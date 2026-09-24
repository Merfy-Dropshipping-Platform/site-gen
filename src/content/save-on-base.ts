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
import type { WriteModel } from "./write-model";
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
   * Модель записи документа (`write-model.ts`): шаги чтения адаптера, фильтр
   * досеянного с эталоном от `storedCurrent`, правила «не правка» (значения по
   * умолчанию панели темы, копии служебных блоков).
   */
  writeModel(
    siteId: string,
    params: SaveParams,
    storedCurrent: Doc | undefined,
  ): Promise<WriteModel>;
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

type ChangeKind = "change" | "volatile" | "panelDefault" | "chromeCopy";

type KindRule = {
  kind: ChangeKind;
  test: (op: Op, base: Doc, side: Doc, model: WriteModel) => boolean;
};

/**
 * Что в `meta.changes` НЕ правка мерчанта — данными; первое сработавшее
 * правило задаёт вид операции `diff(base, side)`.
 */
const NOT_A_CHANGE: KindRule[] = [
  {
    kind: "volatile",
    test: (op) => VOLATILE_PATHS.some((v) => covers(v, op.path)),
  },
  {
    kind: "panelDefault",
    test: (op, base, side, model) => model.isAutoValue(op, base, side),
  },
  {
    kind: "chromeCopy",
    test: (op, base, side, model) => model.isDerived(op, side, base),
  },
];

function kindOf(op: Op, base: Doc, side: Doc, model: WriteModel): ChangeKind {
  const rule = NOT_A_CHANGE.find((r) => r.test(op, base, side, model));
  return rule?.kind ?? "change";
}

/** Изменения ревизии для `meta` (И5): правки мерчанта + сколько было производных. */
interface ChangeReport {
  changes: string[];
  derived?: { chromeCopies: number; panelDefaults: number };
}

function reportChanges(
  ops: readonly Op[],
  base: Doc,
  side: Doc,
  model: WriteModel,
): ChangeReport {
  const kinds = ops.map((op) => kindOf(op, base, side, model));
  const pathsOf = (kind: ChangeKind) =>
    paths(ops.filter((_, i) => kinds[i] === kind));
  const derived = {
    chromeCopies: pathsOf("chromeCopy").length,
    panelDefaults: pathsOf("panelDefault").length,
  };
  const hasDerived = derived.chromeCopies + derived.panelDefaults > 0;
  return { changes: pathsOf("change"), ...(hasDerived ? { derived } : {}) };
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
    const model = await this.store.writeModel(this.siteId, this.params, stored);
    const incoming = await this.incoming(() => model.normalize(stored));
    const report = await this.changesBetween(model, stored, incoming);
    const id = randomUUID();
    const ok = await this.commit(
      [{ id, data: model.filterForWrite(incoming), meta: this.meta(report) }],
      id,
      this.base,
    );
    if (!ok) return null;
    const effect: SaveEffect = {
      merged: false,
      clientVersion: id,
      overwritten: [],
      conflicts: [],
      changes: report.changes,
    };
    return { version: id, effect };
  }

  /** Список изменений не должен ронять запись: не посчитался — `null` и предупреждение. */
  private async changesBetween(
    model: WriteModel,
    stored: Doc | undefined,
    incoming: Doc,
  ): Promise<{ changes: string[] | null }> {
    try {
      const before = await model.normalize(stored);
      const after = await model.normalize(incoming);
      return reportChanges(diff(before, after), before, after, model);
    } catch (e) {
      this.logger.warn(
        `revision changes not computed for site ${this.siteId}: ${e instanceof Error ? e.message : e}`,
      );
      return { changes: null };
    }
  }

  /** База устарела: слияние поверх текущей. */
  private async merge(current: string | null): Promise<SaveResult | null> {
    const stored =
      current === null
        ? undefined
        : await this.store.fetchData(current, this.siteId);
    const baseRaw = await this.fetchBase();
    const model = await this.store.writeModel(this.siteId, this.params, stored);
    const base = await model.normalize(baseRaw);
    const incoming = await model.normalize(
      await this.incoming(async () => base),
    );
    const currentDoc = await model.normalize(stored);
    const result = merge3(base, currentDoc, incoming, this.policy, {
      isAuto: (op, b, side) => model.isAutoValue(op, b, side),
    });
    if (!result.merged) throw new RevisionMergeConflictError(result.conflicts);

    const mergedId = randomUUID();
    const snapshotId = deepEqual(result.merged, incoming) ? null : randomUUID();
    const clientVersion = snapshotId ?? mergedId;
    const report = reportChanges(
      result.applied,
      currentDoc,
      result.merged,
      model,
    );
    const rows: NewRevision[] = [
      ...(snapshotId ? [this.snapshotRow(snapshotId, incoming, mergedId)] : []),
      {
        id: mergedId,
        data: result.merged,
        meta: this.meta({
          ...report,
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
      changes: report.changes,
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

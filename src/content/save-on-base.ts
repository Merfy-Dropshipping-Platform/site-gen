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
 *   база устарела,
 *   политика `refuse` → `revision_conflict`, ничего не записано (откат);
 *   CAS не прошёл     → свежий указатель и новая попытка (слияние поверх
 *                       записи, успевшей раньше).
 * Без базы (`base: null` — первая ревизия) список изменений не считается:
 * от пустого документа это был бы весь магазин. Карта модуля и таблица
 * «писатель → политика» — `README.md`.
 */
import type { Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { apply, diff, isVolatile, merge3, paths } from "./operations";
import type { Doc, MergePolicy, Op } from "./operations";
import { deepEqual } from "./operations/json";
import type { WriteModel } from "./write-model";
import { checkScope, isEmptyScope } from "./check-scope";
import type { CheckScope } from "./check-scope";
import { assertSectionIds } from "./section-ids";
import {
  CLIENT_SNAPSHOT_KIND,
  IdempotencyKeyTakenError,
  RevisionConflictError,
  RevisionMergeConflictError,
} from "./store-content.port";
import type {
  SaveEffect,
  SaveOnBaseParams,
  SaveParams,
  SaveResult,
  SitePatch,
} from "./store-content.port";

export interface NewRevision {
  id: string;
  data: Doc;
  meta: Record<string, unknown>;
  /** Ключ от повторов (К3): колонка `site_revision.idempotency_key`; только у ревизии, которую вернёт повтор. */
  idempotencyKey?: string;
}

/** Ревизия магазина с этим ключом от повторов: id и `meta` (в ней `reply`). */
export interface KeyedRevision {
  id: string;
  meta: Record<string, unknown> | null;
}

/**
 * Ответ записи, сохранённый в `meta.reply` ревизии с ключом: повтор отдаёт
 * его, а не пишет заново (К3). Те же поля, что у ответа RPC записи.
 */
export interface StoredReply {
  revisionId: string;
  currentRevisionId: string;
  merged: boolean;
  overwritten: SaveEffect["overwritten"];
  conflicts: SaveEffect["conflicts"];
  checkScope: CheckScope | null;
}

function replyOf(version: string, effect: SaveEffect): StoredReply {
  return {
    revisionId: effect.clientVersion,
    currentRevisionId: version,
    merged: effect.merged,
    overwritten: effect.overwritten,
    conflicts: effect.conflicts,
    checkScope: effect.checkScope,
  };
}

/** Сохранённый ответ ревизии с ключом как результат записи; нет ответа в `meta` — `null`. */
function replayOf(stored: KeyedRevision): SaveResult | null {
  const meta = stored.meta ?? {};
  const reply = meta.reply as StoredReply | undefined;
  if (!reply) return null;
  return {
    version: reply.currentRevisionId,
    effect: {
      merged: reply.merged,
      clientVersion: reply.revisionId,
      overwritten: reply.overwritten,
      conflicts: reply.conflicts,
      changes: Array.isArray(meta.changes) ? (meta.changes as string[]) : null,
      checkScope: reply.checkScope,
      replayed: true,
    },
    unwritten: true,
  };
}

/** «Ничего не легло» (К2): правку агента целиком остановили места мерчанта. Ревизию не пишем. */
function landedNothing(
  outcome: Pick<SaveEffect, "conflicts" | "checkScope">,
): boolean {
  return outcome.conflicts.length > 0 && isEmptyScope(outcome.checkScope);
}

/** Что алгоритму нужно от хранилища (адаптера модели контента). */
export interface RevisionStore {
  /** Данные ревизии ЭТОГО магазина; нет такой — `undefined`. */
  fetchData(revisionId: string, siteId: string): Promise<Doc | undefined>;
  /** Указатель текущей ревизии свежим чтением. */
  readPointer(siteId: string, tenantId: string): Promise<string | null>;
  /** Ревизия ЭТОГО магазина с таким ключом от повторов; нет — `undefined`. Ключ другого магазина не виден. */
  findByIdempotencyKey(
    siteId: string,
    key: string,
  ): Promise<KeyedRevision | undefined>;
  /**
   * Модель записи документа (`write-model.ts`): шаги чтения адаптера, фильтр
   * досеянного с эталоном от `storedCurrent`, правила «не правка» (значения по
   * умолчанию панели темы, копии служебных блоков).
   */
  writeModel(
    siteId: string,
    params: SaveOnBaseParams,
    storedCurrent: Doc | undefined,
  ): Promise<WriteModel>;
  /**
   * Одна транзакция: вставить `rows`; `current` задан — переставить указатель
   * (и заодно применить `sitePatch` к строке `site`, этап 3, В4); `current` не
   * задан — вставка без переезда указателя вовсе (запись не текущая). `expected`
   * задан — CAS (`null` — «указателя ещё нет», строка — конкретная прежняя
   * ревизия); не задан — переезд безусловный. Единая точка фиксации для обеих
   * форм записи (`save-on-base.ts` и `document.adapter.ts`.`saveWithoutBase`),
   * без дублирования SQL. CAS не прошёл — `false`, ничего не записано. Ключ от
   * повторов уже занят — `IdempotencyKeyTakenError`, ничего не записано.
   */
  commit(write: {
    siteId: string;
    tenantId: string;
    rows: NewRevision[];
    current?: string;
    expected?: string | null;
    createdBy?: string;
    sitePatch?: SitePatch;
  }): Promise<boolean>;
}

/**
 * Попыток CAS на одну запись: каждая неудача — свежий указатель и слияние
 * поверх. Единственный повтор гонки CAS: писатели сверху (`rewrite-current.ts`)
 * его не повторяют.
 */
export const CAS_ATTEMPTS = 3;

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
  { kind: "volatile", test: (op) => isVolatile(op) },
  {
    kind: "panelDefault",
    test: (op, base, side, model) => model.isAutoValue(op, base, side),
  },
  {
    kind: "chromeCopy",
    test: (op, base, side, model) => model.isDerived(op, base, side),
  },
];

function kindOf(op: Op, base: Doc, side: Doc, model: WriteModel): ChangeKind {
  const rule = NOT_A_CHANGE.find((r) => r.test(op, base, side, model));
  return rule?.kind ?? "change";
}

/** Изменения ревизии для `meta` (И5): правки мерчанта + сколько было производных. */
type ChangeReport = {
  changes: string[] | null;
  derived?: { chromeCopies: number; panelDefaults: number };
};

/** Записи без базы: список изменений не считается. */
const NO_BASE_REPORT: ChangeReport = { changes: null };

/** Что проверить после записи — для ответа клиенту, в `meta` не пишется. */
function scopeOf(report: ChangeReport, after: Doc): CheckScope | null {
  return report.changes === null ? null : checkScope(report.changes, after);
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

/**
 * Что проверить между двумя документами магазина, уже прошедшими
 * `model.normalize`: те же правила «не правка мерчанта», что у записи от базы.
 * Публикация (16.11) сравнивает так опубликованную ревизию с черновиком.
 */
export function scopeBetween(
  model: WriteModel,
  before: Doc,
  after: Doc,
): CheckScope {
  const report = reportChanges(diff(before, after), before, after, model);
  return checkScope(report.changes ?? [], after);
}

/** Одна запись от базы: попытки CAS, на каждой — запись поверх текущей или слияние. */
class WriteOnBase {
  constructor(
    private readonly store: RevisionStore,
    private readonly siteId: string,
    private readonly params: SaveOnBaseParams,
    private readonly logger: Logger,
  ) {}

  private get base(): string | null {
    return this.params.base;
  }

  /**
   * Повтор записи с тем же ключом отдаёт сохранённый ответ до всякого слияния;
   * одновременный дубль проигрывает уникальному индексу и тоже получает ответ
   * победителя.
   */
  async run(): Promise<SaveResult> {
    const replayed = await this.replay();
    if (replayed) return replayed;
    try {
      return await this.attempts();
    } catch (e) {
      if (!(e instanceof IdempotencyKeyTakenError)) throw e;
      const winner = await this.replay();
      if (winner) return winner;
      throw e;
    }
  }

  private async replay(): Promise<SaveResult | null> {
    const key = this.params.idempotencyKey;
    if (!key) return null;
    const stored = await this.store.findByIdempotencyKey(this.siteId, key);
    return stored ? replayOf(stored) : null;
  }

  /** Ответ и ключ — на ревизию, которую увидит повтор (только у записи с ключом). */
  private keyed(
    row: NewRevision,
    version: string,
    effect: SaveEffect,
  ): NewRevision {
    const key = this.params.idempotencyKey;
    if (!key) return row;
    return {
      ...row,
      idempotencyKey: key,
      meta: { ...row.meta, reply: replyOf(version, effect) },
    };
  }

  private async attempts(): Promise<SaveResult> {
    let current = await this.initialPointer();
    for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt += 1) {
      const written =
        current === this.base
          ? await this.writeOnCurrent()
          : await this.writeOnStale(current);
      if (written) return written;
      current = await this.store.readPointer(this.siteId, this.params.tenantId);
    }
    throw new RevisionConflictError();
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

  /**
   * Документ пишущего: присланный целиком или операции поверх базы. Повтор id
   * секции после операций — отказ section-id-duplicate, ничего не записано
   * (блок 1 «Секций и SDK», п. 10); документ целиком проверяет
   * StoreContentService.save до записи.
   */
  private async incoming(normalizedBase: () => Promise<Doc>): Promise<Doc> {
    if (!this.params.ops) return this.params.document;
    const document = apply(await normalizedBase(), this.params.ops);
    assertSectionIds(document);
    return document;
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
  private async writeOnCurrent(): Promise<SaveResult | null> {
    const stored = await this.fetchBase();
    const model = await this.store.writeModel(this.siteId, this.params, stored);
    const incoming = await this.incoming(() => model.normalize(stored));
    const { report, scope } =
      this.base === null
        ? { report: NO_BASE_REPORT, scope: null }
        : await this.changesBetween(model, stored, incoming);
    const id = randomUUID();
    const effect: SaveEffect = {
      merged: false,
      clientVersion: id,
      overwritten: [],
      conflicts: [],
      changes: report.changes,
      checkScope: scope,
    };
    const row = this.keyed(
      { id, data: model.filterForWrite(incoming), meta: this.meta(report) },
      id,
      effect,
    );
    if (!(await this.commit([row], id, this.base))) return null;
    return { version: id, effect };
  }

  /** Список изменений не должен ронять запись: не посчитался — `null` и предупреждение. */
  private async changesBetween(
    model: WriteModel,
    stored: Doc | undefined,
    incoming: Doc,
  ): Promise<{ report: ChangeReport; scope: CheckScope | null }> {
    try {
      const before = await model.normalize(stored);
      const after = await model.normalize(incoming);
      const report = reportChanges(diff(before, after), before, after, model);
      return { report, scope: scopeOf(report, after) };
    } catch (e) {
      this.logger.warn(
        `revision changes not computed for site ${this.siteId}: ${e instanceof Error ? e.message : e}`,
      );
      return { report: { changes: null }, scope: null };
    }
  }

  /** База устарела: слить по политике или отказать (`refuse`). */
  private async writeOnStale(
    current: string | null,
  ): Promise<SaveResult | null> {
    const policy = this.params.mergePolicy;
    if (policy === "refuse") throw new RevisionConflictError();
    return this.merge(current, policy);
  }

  /** Слияние поверх текущей. */
  private async merge(
    current: string | null,
    policy: MergePolicy,
  ): Promise<SaveResult | null> {
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
    const result = merge3(base, currentDoc, incoming, policy, {
      isAuto: (op, b, side) => model.isAutoValue(op, b, side),
    });
    if (!result.merged) throw new RevisionMergeConflictError(result.conflicts);

    const report =
      this.base === null
        ? NO_BASE_REPORT
        : reportChanges(result.applied, currentDoc, result.merged, model);
    const outcome: Omit<SaveEffect, "clientVersion"> = {
      merged: true,
      overwritten: result.overwritten,
      conflicts: result.conflicts,
      changes: report.changes,
      checkScope: scopeOf(report, result.merged),
    };
    if (current !== null && landedNothing(outcome))
      return this.untouched(current, outcome);

    const mergedId = randomUUID();
    const snapshotId = deepEqual(result.merged, incoming) ? null : randomUUID();
    const clientVersion = snapshotId ?? mergedId;
    const written: SaveEffect = { ...outcome, clientVersion };
    const mergedRow = this.keyed(
      {
        id: mergedId,
        data: result.merged,
        meta: this.meta({
          ...report,
          merge: {
            onto: current,
            clientVersion,
            overwritten: result.overwritten,
            conflicts: result.conflicts,
          },
        }),
      },
      mergedId,
      written,
    );
    const rows: NewRevision[] = [
      ...(snapshotId ? [this.snapshotRow(snapshotId, incoming, mergedId)] : []),
      mergedRow,
    ];
    if (!(await this.commit(rows, mergedId, current))) return null;
    this.logger.log(
      `revision merged site=${this.siteId} base=${this.base} onto=${current} → ${mergedId} (снимок ${snapshotId ?? "—"}, перезаписано ${result.overwritten.length}, оставлено мерчанту ${result.conflicts.length})`,
    );
    return { version: mergedId, effect: written };
  }

  /**
   * «Ничего не легло» (К2): правки агента целиком остановили места мерчанта.
   * Ревизия не пишется, голова не двигается; ответ несёт текущую ревизию и
   * места, оставленные мерчанту.
   */
  private untouched(
    current: string,
    outcome: Omit<SaveEffect, "clientVersion">,
  ): SaveResult {
    this.logger.log(
      `revision nothing landed site=${this.siteId} base=${this.base} onto=${current} (оставлено мерчанту ${outcome.conflicts.length})`,
    );
    return {
      version: current,
      effect: { ...outcome, merged: false, clientVersion: current },
      unwritten: true,
    };
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
      sitePatch: this.params.sitePatch,
    });
  }
}

export function saveOnBase(
  store: RevisionStore,
  siteId: string,
  params: SaveOnBaseParams,
  logger: Logger,
): Promise<SaveResult> {
  return new WriteOnBase(store, siteId, params, logger).run();
}

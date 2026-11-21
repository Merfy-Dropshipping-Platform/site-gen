/**
 * `StoreContentService` — Nest-провайдер порта `StoreContent`: выбирает
 * адаптер по `site.content_model`. Сегодня поддерживается только
 * `'document'` (`DocumentAdapter`); всё остальное — явная ошибка
 * `content_model_not_supported`, не тихий фолбэк на документ.
 *
 * Бриф: merfy-mcp/docs/plans/2026-09-23-wave1-content-port.md §1.1.
 */
import { Injectable, Optional } from "@nestjs/common";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  StorefrontHandoff,
  type DraftAuthor,
  type DraftSignalExtra,
} from "../storefront-handoff/storefront-handoff.service";
import { labelsOf, type Writer } from "./writer";
import { DocumentAdapter } from "./document.adapter";
import { buildThemeCanon } from "./canon";
import { isNewThemeId } from "./new-theme-pages";
import { assertSectionIds } from "./section-ids";
import type * as schema from "../db/schema";
import type {
  CreateRevisionParams,
  CreateRevisionResult,
  DiffOptions,
  DiffResult,
  GetOptions,
  HistoryOptions,
  HistoryPage,
  LoadOptions,
  LoadResult,
  RevisionEnvelope,
  RevisionItem,
  RollbackParams,
  RollbackResult,
  SaveParams,
  SaveResult,
  StoreContent,
  StoreContentSite,
  UndoAgentParams,
  UndoAgentResult,
} from "./store-content.port";
import type { CheckScope } from "./check-scope";

@Injectable()
export class StoreContentService implements StoreContent {
  constructor(
    private readonly documentAdapter: DocumentAdapter,
    // Сигнал открытым редакторам о записи черновика (магазины новой темы). Нет в сборках вне Nest DI.
    @Optional() private readonly handoff?: StorefrontHandoff,
  ) {}

  /**
   * Запись сделала ревизию текущей — открытые редакторы магазина новой темы подтянут её по сигналу
   * (`/sites/:id/preview/events`). Не ждём: сигнал записи не задерживает и не ломает. `extra` — автор записи и её
   * область, чтобы редактор отличил чужую правку и обновил только тронутые секции.
   */
  private signalDraft(
    siteId: string,
    site: StoreContentSite,
    revisionId: string,
    extra: DraftSignalExtra = {},
  ): void {
    if (!this.handoff || !isNewThemeId(site.themeId)) return;
    // signalDraft сбои брокера глотает сам; catch — страховка, запись важнее сигнала.
    void this.handoff
      .signalDraft(siteId, revisionId, extra)
      .catch(() => undefined);
  }

  async load(siteId: string, opts: LoadOptions): Promise<LoadResult> {
    return this.resolveAdapter(opts.site).load(siteId, opts);
  }

  async loadOrNull(
    siteId: string,
    opts: LoadOptions,
  ): Promise<LoadResult | null> {
    return this.resolveAdapter(opts.site).loadOrNull(siteId, opts);
  }

  async save(siteId: string, params: SaveParams): Promise<SaveResult> {
    // Повтор id секции на странице — отказ до записи (блок 1 «Секций и SDK»,
    // п. 10). Запись операциями (ops) документа целиком не несёт — её
    // проверяет save-on-base.ts после операций.
    assertSectionIds(params.document);
    const saved = await this.resolveAdapter(params.site).save(siteId, params);
    // Запись от базы всегда делает ревизию текущей; вслепую — только с setCurrent.
    // Повтор по ключу и «ничего не легло» ревизии не создают — сигналить не о чем.
    if (!saved.unwritten && (params.mode === "on-base" || params.setCurrent))
      this.signalDraft(siteId, params.site, saved.version, {
        author: authorOf(params.actor, params.source),
        // Области нет у записи вслепую и у записи, где `changes` не посчитались (null) — тогда редактор перечитает всё.
        scope: saved.effect?.checkScope ?? undefined,
      });
    return saved;
  }

  async history(siteId: string, opts: HistoryOptions): Promise<HistoryPage> {
    return this.resolveAdapter(opts.site).history(siteId, opts);
  }

  async get(
    siteId: string,
    revisionId: string,
    opts: GetOptions,
  ): Promise<RevisionItem> {
    return this.resolveAdapter(opts.site).get(siteId, revisionId, opts);
  }

  async envelopeOrNull(
    siteId: string,
    revisionId: string,
    opts: GetOptions,
  ): Promise<RevisionEnvelope | null> {
    return this.resolveAdapter(opts.site).envelopeOrNull(
      siteId,
      revisionId,
      opts,
    );
  }

  async rollback(
    siteId: string,
    params: RollbackParams,
  ): Promise<RollbackResult> {
    const restored = await this.resolveAdapter(params.site).rollback(
      siteId,
      params,
    );
    // Выбранная версия уже текущая — ничего не писалось, сигналить не о чем.
    // Область у отката не считается — сигнал без неё, редактор перечитает всё.
    if (params.revisionId !== params.site.currentRevisionId)
      this.signalDraft(siteId, params.site, restored.revisionId, {
        author: rollbackAuthor(params.writer),
      });
    return restored;
  }

  async diff(
    siteId: string,
    from: string,
    to: string,
    opts: DiffOptions,
  ): Promise<DiffResult> {
    return this.resolveAdapter(opts.site).diff(siteId, from, to, opts);
  }

  async checkScopeBetween(
    siteId: string,
    from: string | null,
    to: string,
    opts: DiffOptions,
  ): Promise<CheckScope> {
    return this.resolveAdapter(opts.site).checkScopeBetween(
      siteId,
      from,
      to,
      opts,
    );
  }

  async undoAgent(
    siteId: string,
    params: UndoAgentParams,
  ): Promise<UndoAgentResult> {
    const undone = await this.resolveAdapter(params.site).undoAgent(
      siteId,
      params,
    );
    // «Ничего не изменилось» и повтор по ключу ревизии не создают — сигналить не о чем.
    // Область не считается — сигнал без неё, редактор перечитает всё (как у отката).
    if (undone.revisionId !== null && !undone.replayed)
      this.signalDraft(siteId, params.site, undone.revisionId, {
        author: { actor: "agent", source: params.source },
      });
    return undone;
  }

  /**
   * Удобный вход для писателей с плоским историческим контрактом
   * (`store-content.port.ts`, `CreateRevisionParams`): сама решает форму
   * `SaveParams` и переводит эффект записи в старую форму ответа
   * (`revisionId`/`currentRevisionId`/`merged`/…), которую уже знают клиенты
   * (RPC `sites.revisions.create`, создание магазина, легаси-пересев темы).
   */
  async createRevision(
    siteId: string,
    params: CreateRevisionParams,
  ): Promise<CreateRevisionResult> {
    const saved = await this.save(siteId, toSaveParams(params));
    if (!saved.effect) return { revisionId: saved.version };
    return {
      revisionId: saved.effect.clientVersion,
      currentRevisionId: saved.version,
      merged: saved.effect.merged,
      overwritten: saved.effect.overwritten,
      conflicts: saved.effect.conflicts,
      checkScope: saved.effect.checkScope,
      ...(saved.effect.replayed ? { replayed: true } : {}),
    };
  }

  /** Канон темы — см. `canon.ts`. Не привязан к сайту/модели контента. */
  async buildInitialRevision(
    themeId: string,
  ): Promise<Record<string, unknown> | null> {
    return buildThemeCanon(themeId);
  }

  private resolveAdapter(site: StoreContentSite): StoreContent {
    const contentModel = site.contentModel ?? "document";
    if (contentModel === "document") return this.documentAdapter;
    throw new Error("content_model_not_supported");
  }

  /**
   * Число версий магазина (без снимков клиента) для ПАЧКИ сайтов —
   * `admin/bulk` (экспорт). Ниже диспетчера по `content_model`: считает
   * пачкой, а не по адаптеру на сайт — сегодня модель одна ('document'), и
   * заводить дозвон на каждый сайт ради будущей гипотетической модели —
   * пока не нужно (пересмотреть, когда появится вторая модель).
   */
  async historyCounts(siteIds: string[]): Promise<Map<string, number>> {
    return this.documentAdapter.historyCounts(siteIds);
  }
}

/** Автор записи для сигнала: обе метки заданы — они же, что в истории ревизий; иначе автора нет. */
function authorOf(
  actor: string | undefined,
  source: string | undefined,
): DraftAuthor | undefined {
  return actor && source ? { actor, source } : undefined;
}

/** Автор отката: мерчант — `merchant/rollback`, агент — свои метки (`labelsOf`, как в истории). */
function rollbackAuthor(writer: Writer | undefined): DraftAuthor {
  return labelsOf(writer, { actor: "merchant", source: "rollback" });
}

/** `CreateRevisionParams` → форма записи порта: с базой — от базы, без неё — вслепую. */
function toSaveParams(params: CreateRevisionParams): SaveParams {
  const common = {
    document: params.data,
    tenantId: params.tenantId,
    meta: params.meta,
    actorUserId: params.actorUserId,
    filterSeeded: params.filterSeededPages,
    actor: params.actor,
    source: params.source,
    site: params.site,
  };
  if (params.base === undefined) {
    return {
      mode: "blind",
      setCurrent: params.setCurrent,
      expectedVersion: params.expectedCurrentRevisionId,
      ...common,
    };
  }
  // Запись от базы всегда делает ревизию текущей и не знает жёсткого CAS:
  // такие сочетания — явная ошибка, а не тихий уход в другой путь.
  if (!params.setCurrent) throw new Error("base_requires_set_current");
  if (params.expectedCurrentRevisionId !== undefined) {
    throw new Error("base_and_expected_version_are_exclusive");
  }
  return {
    mode: "on-base",
    base: params.base,
    mergePolicy: params.mergePolicy ?? "reject-conflicts",
    idempotencyKey: params.idempotencyKey,
    ...common,
  };
}

/**
 * Фолбэк вне Nest DI (тесты/классы, которые собирают себя напрямую — см.
 * SitesDomainService/PreviewController): при отсутствии инъекции строит
 * DocumentAdapter на переданном `db` сам. Общая точка, чтобы оба класса не
 * держали одну и ту же фабрику дважды.
 */
export function resolveStoreContent(
  injected: StoreContentService | undefined,
  db: NodePgDatabase<typeof schema>,
): StoreContentService {
  return injected ?? new StoreContentService(new DocumentAdapter(db));
}

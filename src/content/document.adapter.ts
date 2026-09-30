/**
 * `DocumentAdapter` — единственный сегодня адаптер порта `StoreContent`.
 *
 * Ровно путь `SitesDomainService.getRevision()`/`createRevision()` ДО этого
 * порта (см. факты в шапке брифа merfy-mcp/docs/plans/2026-09-23-wave1-content-port.md):
 *   load = выборка ревизии (текущая или по revisionId) → migrateRevisionData →
 *          normalizeRevision (PageResolver) → seedContentPagesFromTheme (B17) →
 *          resolveAssetUrls
 *   save = от базы (`mode: "on-base"`, этап 2) → save-on-base.ts: CAS или
 *          слияние; этот адаптер даёт алгоритму хранилище (ревизии,
 *          указатель, транзакция) и нормализатор (свои шаги чтения + фильтр
 *          досеянного);
 *          вслепую (`mode: "blind"`) — как раньше: опц.
 *          filterSeededPagesOnWrite → insert (+ CAS по expectedVersion в
 *          транзакции, если запрошен) → { version }
 * Карта модуля — `README.md`.
 *
 * `site`-метаданные (тема/publicUrl/…) приходят ПАРАМЕТРОМ, а не
 * отдельным `SELECT` по `schema.site` — так адаптер остаётся мокаемым теми
 * же тестами, что сегодня мокают `SitesDomainService.get()` напрямую
 * (golden.spec.ts, site-create-theme.characterization.spec.ts,
 * revision-create-cas.spec.ts — у последнего `db`-мок вообще не даёт `select`).
 * Исключение — запись с базой: при неудачном CAS свежий указатель читается
 * здесь (`readPointer`), иначе повтор слил бы поверх устаревшего знания.
 */
import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { PG_CONNECTION } from "../constants";
import * as schema from "../db/schema";
import { migrateRevisionData } from "../utils/revision-migrations";
import { getPageResolver } from "../themes/page-resolver-instance";
import { seedContentPagesFromTheme } from "../themes/content-page-seed";
import { resolveAssetUrls } from "../themes/asset-resolver";
import { filterSeededPagesOnWrite } from "../utils/revision-write-filter";
import { parityOn } from "../themes/parity-switch";
import { makeDocumentWriteModel } from "./write-model";
import type { WriteModel } from "./write-model";
import { PANEL_DEFAULTS, puckConfigPanelDefaults } from "./panel-defaults";
import type { PanelDefaultsSource } from "./panel-defaults";
import { saveOnBase, writeLabels } from "./save-on-base";
import type { RevisionStore } from "./save-on-base";
import { RevisionConflictError } from "./store-content.port";
import type {
  BlindSaveParams,
  DiffOptions,
  DiffResult,
  GetOptions,
  HistoryItem,
  HistoryOptions,
  HistoryPage,
  LoadOptions,
  LoadResult,
  RevisionItem,
  RollbackParams,
  RollbackResult,
  SaveOnBaseParams,
  SaveParams,
  SaveResult,
  StoreContent,
  StoreContentSite,
} from "./store-content.port";
import { diff as diffDocuments } from "./operations";
import { isStoreVersion } from "./revision-kinds";

// Тот же флаг, что в sites.service.ts/preview.controller.ts — поведение шага
// normalize не меняется, просто у него теперь собственная копия условия.
const USE_PAGE_RESOLVER = process.env.USE_PAGE_RESOLVER !== "false";

type StepContext = {
  siteId: string;
  themeId: string | null;
  publicUrl: string | null;
  siteName: string | null;
  logger: Logger;
  /**
   * Ребейз на PARITY_FOOTER (main, 23.09): подвал досеянной/мигрированной
   * страницы = подвал главной. Вычисляется один раз в `load()` — тот же
   * выключатель `parityOn("FOOTER", siteId)`, что и в getRevision на main,
   * до порта. PARITY_CHROME проверен отдельно (51f79375) — он живёт в
   * assembleChrome/pagePropsPreparer, шага load() не касается вовсе.
   */
  unifyFooter: boolean;
};

type LoadStep = {
  name: string;
  apply: (
    data: Record<string, unknown>,
    ctx: StepContext,
  ) => Promise<Record<string, unknown>> | Record<string, unknown>;
};

function migrateStep(data: Record<string, unknown>, ctx: StepContext) {
  return migrateRevisionData(data, ctx.themeId, ctx.siteName, {
    unifyFooter: ctx.unifyFooter,
  });
}

/**
 * PageResolver.normalizeRevision — домёрдживает метаданные страниц манифеста
 * темы. Сбой не фатален (как в сегодняшнем getRevision): шаг оставляет данные
 * как после migrate и только пишет warn.
 */
function normalizeStep(data: Record<string, unknown>, ctx: StepContext) {
  if (!USE_PAGE_RESOLVER || !ctx.themeId) return data;
  try {
    return getPageResolver(ctx.themeId).normalizeRevision(
      data,
    ) as unknown as Record<string, unknown>;
  } catch (e) {
    ctx.logger.warn(
      `PageResolver.normalizeRevision failed for site ${ctx.siteId}: ${e instanceof Error ? e.message : e}`,
    );
    return data;
  }
}

function seedStep(data: Record<string, unknown>, ctx: StepContext) {
  return seedContentPagesFromTheme(data, ctx.themeId, {
    unifyFooter: ctx.unifyFooter,
  });
}

function resolveStep(data: Record<string, unknown>, ctx: StepContext) {
  return resolveAssetUrls(data, ctx.publicUrl);
}

/**
 * Таблица шагов `load`, не лестница вызовов: новый шаг — новая строка, без
 * правки соседних.
 */
const LOAD_STEPS: LoadStep[] = [
  { name: "migrate", apply: migrateStep },
  { name: "normalize", apply: normalizeStep },
  { name: "seed", apply: seedStep },
  { name: "resolve", apply: resolveStep },
];

async function runLoadSteps(
  raw: Record<string, unknown> | undefined,
  ctx: StepContext,
): Promise<Record<string, unknown>> {
  let data: Record<string, unknown> = raw ?? {};
  for (const step of LOAD_STEPS) {
    data = await step.apply(data, ctx);
  }
  return data;
}

function stepContextFor(
  siteId: string,
  site: StoreContentSite,
  logger: Logger,
): StepContext {
  return {
    siteId,
    themeId: site.themeId,
    publicUrl: site.publicUrl,
    siteName: site.name ?? null,
    logger,
    unifyFooter: parityOn("FOOTER", siteId),
  };
}

/** CAS не прошёл внутри транзакции — откатить вставку и сообщить наружу `false`. */
class CasMiss extends Error {}

/** R3: колонка `kind` из `meta.kind` — та же метка, только не внутри jsonb. */
function kindOfMeta(meta: Record<string, unknown> | undefined): string | null {
  const kind = meta?.kind;
  return typeof kind === "string" ? kind : null;
}

/** R3: строка истории из конверта + `meta` (И5: actor/source/changes/restoredFrom). */
function historyItemOf(row: {
  id: string;
  createdAt: Date;
  meta: unknown;
}): HistoryItem {
  const meta = (row.meta ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    createdAt: row.createdAt,
    actor: typeof meta.actor === "string" ? (meta.actor as HistoryItem["actor"]) : null,
    source: typeof meta.source === "string" ? (meta.source as HistoryItem["source"]) : null,
    changes: Array.isArray(meta.changes) ? (meta.changes as string[]) : null,
    restoredFrom: typeof meta.restoredFrom === "string" ? meta.restoredFrom : null,
  };
}

@Injectable()
export class DocumentAdapter implements StoreContent {
  private readonly logger = new Logger(DocumentAdapter.name);

  private readonly panelDefaults: PanelDefaultsSource;

  constructor(
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
    // Значения по умолчанию панели конструктора (автозначения — не правка).
    // По умолчанию — тот же puck-config, что получает конструктор.
    @Optional()
    @Inject(PANEL_DEFAULTS)
    panelDefaults?: PanelDefaultsSource,
  ) {
    this.panelDefaults = panelDefaults ?? puckConfigPanelDefaults;
  }

  async load(siteId: string, opts: LoadOptions): Promise<LoadResult> {
    const revisionId =
      opts.revisionId ?? opts.site.currentRevisionId ?? undefined;
    if (!revisionId) throw new Error("revision_not_found");
    const rev = await this.fetchRevision(revisionId, siteId);
    if (!rev) throw new Error("revision_not_found");
    if (opts.asStored) {
      return {
        document: (rev.data ?? {}) as Record<string, unknown>,
        version: revisionId,
      };
    }
    const document = await runLoadSteps(
      rev.data as Record<string, unknown> | undefined,
      stepContextFor(siteId, opts.site, this.logger),
    );
    return { document, version: revisionId };
  }

  async save(siteId: string, params: SaveParams): Promise<SaveResult> {
    if (params.mode === "on-base") {
      return saveOnBase(this.revisionStore, siteId, params, this.logger);
    }
    return this.saveWithoutBase(siteId, params);
  }

  /** История версий магазина (R1/R3): без служебных снимков клиента (И4). */
  async history(siteId: string, opts: HistoryOptions): Promise<HistoryPage> {
    const limit = opts.limit ?? 50;
    const conditions = [eq(schema.siteRevision.siteId, siteId), isStoreVersion()];
    if (opts.before) conditions.push(lt(schema.siteRevision.createdAt, opts.before));
    const rows = await this.db
      .select({
        id: schema.siteRevision.id,
        createdAt: schema.siteRevision.createdAt,
        meta: schema.siteRevision.meta,
      })
      .from(schema.siteRevision)
      .where(and(...conditions))
      .orderBy(desc(schema.siteRevision.createdAt))
      .limit(limit);
    return {
      items: rows.map(historyItemOf),
      nextBefore: rows.length === limit ? rows[rows.length - 1].createdAt : null,
    };
  }

  /**
   * Разница `from` → `to` (R3): оба документа читаются тем же путём, что и
   * обычное `load` (миграции, досев, адреса — «одна версия формата», как у
   * слияния), затем движок строит список операций.
   */
  async diff(
    siteId: string,
    from: string,
    to: string,
    opts: DiffOptions,
  ): Promise<DiffResult> {
    const [a, b] = await Promise.all([
      this.load(siteId, { revisionId: from, site: opts.site }),
      this.load(siteId, { revisionId: to, site: opts.site }),
    ]);
    return { ops: diffDocuments(a.document, b.document) };
  }

  /** Конкретная ревизия: конверт (без `data`) отдельным SELECT + содержимое через `load`. */
  async get(
    siteId: string,
    revisionId: string,
    opts: GetOptions,
  ): Promise<RevisionItem> {
    const [envelope] = await this.db
      .select({
        id: schema.siteRevision.id,
        siteId: schema.siteRevision.siteId,
        meta: schema.siteRevision.meta,
        createdAt: schema.siteRevision.createdAt,
        createdBy: schema.siteRevision.createdBy,
      })
      .from(schema.siteRevision)
      .where(
        and(
          eq(schema.siteRevision.id, revisionId),
          eq(schema.siteRevision.siteId, siteId),
        ),
      );
    if (!envelope) throw new Error("revision_not_found");
    // Как и раньше (getRevision): конверт прокидывается КАК ЕСТЬ, без
    // нормализации отсутствующих полей — байт-в-байт форма ответа не меняется
    // (золотые документы сравнивают именно её).
    const loaded = await this.load(siteId, { revisionId, site: opts.site });
    return { ...envelope, data: loaded.document } as RevisionItem;
  }

  /**
   * Откат (этап 2, И6): новая ревизия — точная копия выбранной версии (как
   * она хранится), со сверкой «текущая = та, что видел клиент». Сменилась —
   * `revision_conflict`, ничего не пишется. Выбранная версия и так текущая —
   * ничего не пишется, ответ несёт её же id.
   */
  async rollback(siteId: string, params: RollbackParams): Promise<RollbackResult> {
    const target = await this.load(siteId, {
      revisionId: params.revisionId,
      site: params.site,
      asStored: true,
    });
    const restored = {
      success: true as const,
      restoredFrom: params.revisionId,
    };
    if (params.revisionId === params.site.currentRevisionId) {
      return { ...restored, revisionId: params.revisionId };
    }
    const seen =
      params.base !== undefined ? params.base : params.site.currentRevisionId;
    const saved = await this.save(siteId, {
      mode: "on-base",
      document: target.document,
      base: seen ?? null,
      tenantId: params.tenantId,
      actor: "merchant",
      source: "rollback",
      mergePolicy: "refuse",
      meta: { restoredFrom: params.revisionId },
      actorUserId: params.actorUserId,
      site: params.site,
    });
    return { ...restored, revisionId: saved.version };
  }

  /**
   * Запись вслепую (создание магазина, смена темы, жёсткий CAS по
   * `expectedVersion`) — как до этапа 2, но теперь ОДНИМ конвейером с
   * записью от базы: обе формы сходятся в единственную `commit()` (этап 3,
   * R2 `merfy-mcp/docs/plans/2026-09-30-revisions-clean.md`). Раньше здесь
   * был второй путь (`insertRevision`+`setCurrentUnconditional` — два
   * отдельных, не завёрнутых в транзакцию запроса рядом с CAS-веткой,
   * дублирующей SQL из `commit()`); теперь `commit()` сама решает по
   * `current`/`expected`, двигать ли указатель и проверять ли CAS.
   */
  private async saveWithoutBase(
    siteId: string,
    params: BlindSaveParams,
  ): Promise<SaveResult> {
    if (params.sitePatch && !params.setCurrent) {
      // sitePatch садится на UPDATE site, который делает только setCurrent —
      // без него патчу не на что сесть, и он молча пропал бы.
      throw new Error("site_patch_requires_set_current");
    }
    const id = randomUUID();
    const dataToPersist = params.filterSeeded
      ? await this.stripSeededPages(siteId, params.site, params.document)
      : params.document;
    const meta = this.legacyMeta(params);

    const ok = await this.commit({
      siteId,
      tenantId: params.tenantId,
      rows: [{ id, data: dataToPersist, meta: meta ?? {} }],
      current: params.setCurrent ? id : undefined,
      expected: params.setCurrent ? params.expectedVersion : undefined,
      createdBy: params.actorUserId,
      sitePatch: params.sitePatch,
    });
    if (!ok) throw new RevisionConflictError();
    return { version: id };
  }

  /** Метки (И5) дописываются, только если их передали: meta старых путей не меняется. */
  private legacyMeta(
    params: BlindSaveParams,
  ): Record<string, unknown> | undefined {
    const labels = writeLabels(params);
    if (Object.keys(labels).length === 0) return params.meta;
    return { ...(params.meta ?? {}), ...labels };
  }

  // -- хранилище для записи с базой ---------------------------------------

  private get revisionStore(): RevisionStore {
    return {
      fetchData: async (revisionId, siteId) =>
        (await this.fetchRevision(revisionId, siteId))?.data as
          | Record<string, unknown>
          | undefined,
      readPointer: (siteId, tenantId) => this.readPointer(siteId, tenantId),
      commit: (write) => this.commit(write),
      writeModel: (siteId, params, storedCurrent) =>
        this.writeModel(siteId, params, storedCurrent),
    };
  }

  private async writeModel(
    siteId: string,
    params: SaveOnBaseParams,
    storedCurrent: Record<string, unknown> | undefined,
  ): Promise<WriteModel> {
    const ctx = stepContextFor(siteId, params.site, this.logger);
    const themeId = params.site.themeId ?? null;
    return makeDocumentWriteModel({
      load: (doc) => runLoadSteps(doc, ctx),
      storedCurrent,
      themeId,
      publicUrl: params.site.publicUrl ?? null,
      filterSeeded: Boolean(params.filterSeeded),
      panelDefaults: themeId ? await this.panelDefaults(themeId) : {},
      warn: (message) => this.logger.warn(`site ${siteId}: ${message}`),
    });
  }

  private async readPointer(
    siteId: string,
    tenantId: string,
  ): Promise<string | null> {
    const [row] = await this.db
      .select({ currentRevisionId: schema.site.currentRevisionId })
      .from(schema.site)
      .where(
        and(eq(schema.site.id, siteId), eq(schema.site.tenantId, tenantId)),
      );
    if (!row) throw new Error("site_not_found");
    return row.currentRevisionId ?? null;
  }

  /**
   * Единственная точка фиксации записи (R2): вставка ревизий + (если задан
   * `current`) сдвиг указателя, при необходимости под CAS, плюс `sitePatch` на
   * ту же строку `site` — одной транзакцией. И на быстром пути (без базы), и
   * при записи от базы SQL один и тот же — дублирования нет.
   *
   * `current` не задан — только вставка, указатель не трогаем (запись не
   * становится текущей). `expected` не задан — переезд безусловный (как раньше
   * `setCurrentUnconditional`); `expected` задан — CAS: 0 обновлённых строк →
   * `CasMiss`, транзакция откатывается целиком (вставленные ревизии тоже).
   */
  private async commit(
    write: Parameters<RevisionStore["commit"]>[0],
  ): Promise<boolean> {
    try {
      await this.db.transaction(async (tx) => {
        for (const row of write.rows) {
          await tx.insert(schema.siteRevision).values({
            id: row.id,
            siteId: write.siteId,
            data: row.data ?? {},
            meta: row.meta ?? {},
            // R3: колонка зеркалит meta.kind (совместимость на время
            // выкатки, revision-kinds.ts читает колонку). Сегодня непустой
            // kind пишет только снимок клиента (save-on-base.ts, snapshotRow).
            kind: kindOfMeta(row.meta),
            createdAt: new Date(),
            createdBy: write.createdBy,
          });
        }
        if (write.current === undefined) return;
        const sitePatch: Record<string, unknown> = {
          currentRevisionId: write.current,
          updatedAt: new Date(),
          ...write.sitePatch,
        };
        if (write.expected === undefined) {
          await tx
            .update(schema.site)
            .set(sitePatch)
            .where(
              and(
                eq(schema.site.id, write.siteId),
                eq(schema.site.tenantId, write.tenantId),
              ),
            );
          return;
        }
        const expectedPredicate =
          write.expected === null
            ? isNull(schema.site.currentRevisionId)
            : eq(schema.site.currentRevisionId, write.expected);
        const updated = await tx
          .update(schema.site)
          .set(sitePatch)
          .where(
            and(
              eq(schema.site.id, write.siteId),
              eq(schema.site.tenantId, write.tenantId),
              expectedPredicate,
            ),
          )
          .returning({ id: schema.site.id });
        if (updated.length === 0) throw new CasMiss();
      });
      return true;
    } catch (e) {
      if (e instanceof CasMiss) return false;
      throw e;
    }
  }

  // -- load helpers ----------------------------------------------------

  private async fetchRevision(revisionId: string, siteId: string) {
    // Только data — конверт (meta/createdAt/createdBy) отдельным SELECT
    // читают вызывающие (SitesDomainService.getRevision, build.service.ts
    // stageMerge), которым он нужен; порту эти поля не нужны вовсе.
    const [rev] = await this.db
      .select({ data: schema.siteRevision.data })
      .from(schema.siteRevision)
      .where(
        and(
          eq(schema.siteRevision.id, revisionId),
          eq(schema.siteRevision.siteId, siteId),
        ),
      );
    return rev;
  }

  // -- save helpers ------------------------------------------------------

  /**
   * B17: убирает из сохраняемой ревизии страницы, которые сервер и так
   * досеивает при чтении. Подробный разбор — utils/revision-write-filter.ts.
   * Эталон сида считается от ПРЕДЫДУЩЕЙ СОХРАНЁННОЙ ревизии (сырой, без
   * миграций) — иначе он вычислялся бы из тех же данных, которые проверяем.
   */
  private async stripSeededPages(
    siteId: string,
    site: StoreContentSite,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    try {
      const storedPrev = await this.fetchStoredPrev(
        site.currentRevisionId ?? null,
      );
      const res = await filterSeededPagesOnWrite(
        data,
        storedPrev,
        site.themeId ?? null,
        site.publicUrl ?? null,
      );
      if (res.dropped.length || res.unfrozen.length) {
        this.logger.log(
          `revision write filter site=${siteId}: не вморожено ${res.dropped.length} [${res.dropped.join(",")}], разморожено ${res.unfrozen.length} [${res.unfrozen.join(",")}]`,
        );
      }
      return res.data;
    } catch (e) {
      // Фильтр — оптимизация, а не условие записи. Упал — пишем как прислали.
      this.logger.warn(
        `revision write filter failed for site ${siteId}: ${e instanceof Error ? e.message : e}`,
      );
      return data;
    }
  }

  private async fetchStoredPrev(
    currentRevisionId: string | null,
  ): Promise<Record<string, unknown> | null> {
    if (!currentRevisionId) return null;
    const [prev] = await this.db
      .select({ data: schema.siteRevision.data })
      .from(schema.siteRevision)
      .where(eq(schema.siteRevision.id, currentRevisionId));
    return (prev?.data as Record<string, unknown> | undefined) ?? null;
  }

}

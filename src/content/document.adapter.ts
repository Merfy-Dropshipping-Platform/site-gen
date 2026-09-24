/**
 * `DocumentAdapter` — единственный сегодня адаптер порта `StoreContent`.
 *
 * Ровно путь `SitesDomainService.getRevision()`/`createRevision()` ДО этого
 * порта (см. факты в шапке брифа merfy-mcp/docs/plans/2026-09-23-wave1-content-port.md):
 *   load = выборка ревизии (текущая или по revisionId) → migrateRevisionData →
 *          normalizeRevision (PageResolver) → seedContentPagesFromTheme (B17) →
 *          resolveAssetUrls
 *   save = с базой (этап 2) → save-on-base.ts: CAS или слияние; этот адаптер
 *          даёт алгоритму хранилище (ревизии, указатель, транзакция) и
 *          нормализатор (свои шаги чтения + фильтр досеянного);
 *          без базы — как раньше: опц. filterSeededPagesOnWrite → insert
 *          (+ CAS по expectedVersion в транзакции, если запрошен) → { version }
 *
 * `site`-метаданные (тема/publicUrl/…) приходят ПАРАМЕТРОМ, а не
 * отдельным `SELECT` по `schema.site` — так адаптер остаётся мокаемым теми
 * же тестами, что сегодня мокают `SitesDomainService.get()` напрямую
 * (golden.spec.ts, site-create-theme.characterization.spec.ts,
 * revision-create-cas.spec.ts — у последнего `db`-мок вообще не даёт `select`).
 * Исключение — запись с базой: при неудачном CAS свежий указатель читается
 * здесь (`readPointer`), иначе повтор слил бы поверх устаревшего знания.
 */
import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, isNull } from "drizzle-orm";
import { PG_CONNECTION } from "../constants";
import * as schema from "../db/schema";
import { migrateRevisionData } from "../utils/revision-migrations";
import { getPageResolver } from "../themes/page-resolver-instance";
import { seedContentPagesFromTheme } from "../themes/content-page-seed";
import { resolveAssetUrls } from "../themes/asset-resolver";
import { filterSeededPagesOnWrite } from "../utils/revision-write-filter";
import { parityOn } from "../themes/parity-switch";
import { makeDocumentNormalizer } from "./document-normalizer";
import { saveOnBase, writeLabels } from "./save-on-base";
import type { RevisionStore } from "./save-on-base";
import type {
  LoadOptions,
  LoadResult,
  SaveParams,
  SaveResult,
  StoreContent,
  StoreContentSite,
} from "./store-content.port";

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

@Injectable()
export class DocumentAdapter implements StoreContent {
  private readonly logger = new Logger(DocumentAdapter.name);

  constructor(
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

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
    if (params.base !== undefined && params.setCurrent) {
      return saveOnBase(this.revisionStore, siteId, params, this.logger);
    }
    return this.saveWithoutBase(siteId, params);
  }

  /** Старые пути (создание магазина, смена темы, CAS по expectedVersion) — без изменений. */
  private async saveWithoutBase(
    siteId: string,
    params: SaveParams,
  ): Promise<SaveResult> {
    if (!params.document) throw new Error("document_required");
    const id = randomUUID();
    const dataToPersist = params.filterSeeded
      ? await this.stripSeededPages(siteId, params.site, params.document)
      : params.document;
    const meta = this.legacyMeta(params);

    const expectedVersion = params.expectedVersion;
    if (params.setCurrent && expectedVersion !== undefined) {
      const ok = await this.commit({
        siteId,
        tenantId: params.tenantId,
        rows: [{ id, data: dataToPersist, meta: meta ?? {} }],
        current: id,
        expected: expectedVersion,
        createdBy: params.actorUserId,
      });
      if (!ok) throw new Error("revision_conflict");
      return { version: id };
    }

    await this.insertRevision(
      id,
      siteId,
      dataToPersist,
      meta,
      params.actorUserId,
    );
    if (params.setCurrent) {
      await this.setCurrentUnconditional(siteId, params.tenantId, id);
    }
    return { version: id };
  }

  /** Метки (И5) дописываются, только если их передали: meta старых путей не меняется. */
  private legacyMeta(params: SaveParams): Record<string, unknown> | undefined {
    const base = params.base !== undefined ? { base: params.base } : {};
    const extra = { ...writeLabels(params), ...base };
    if (Object.keys(extra).length === 0) return params.meta;
    return { ...(params.meta ?? {}), ...extra };
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
      normalizer: (siteId, params, storedCurrent) => {
        const ctx = stepContextFor(siteId, params.site, this.logger);
        return makeDocumentNormalizer({
          load: (doc) => runLoadSteps(doc, ctx),
          storedCurrent,
          themeId: params.site.themeId ?? null,
          publicUrl: params.site.publicUrl ?? null,
          filterSeeded: Boolean(params.filterSeeded),
        });
      },
    };
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

  /** Вставка ревизий + CAS указателя одной транзакцией; CAS не прошёл — откат и `false`. */
  private async commit(
    write: Parameters<RevisionStore["commit"]>[0],
  ): Promise<boolean> {
    const expectedPredicate =
      write.expected === null
        ? isNull(schema.site.currentRevisionId)
        : eq(schema.site.currentRevisionId, write.expected);
    try {
      await this.db.transaction(async (tx) => {
        for (const row of write.rows) {
          await tx.insert(schema.siteRevision).values({
            id: row.id,
            siteId: write.siteId,
            data: row.data ?? {},
            meta: row.meta ?? {},
            createdAt: new Date(),
            createdBy: write.createdBy,
          });
        }
        const updated = await tx
          .update(schema.site)
          .set({ currentRevisionId: write.current, updatedAt: new Date() })
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

  private async insertRevision(
    id: string,
    siteId: string,
    data: Record<string, unknown>,
    meta: Record<string, unknown> | undefined,
    actorUserId: string | undefined,
  ): Promise<void> {
    await this.db.insert(schema.siteRevision).values({
      id,
      siteId,
      data: data ?? {},
      meta: meta ?? {},
      createdAt: new Date(),
      createdBy: actorUserId,
    });
  }

  private async setCurrentUnconditional(
    siteId: string,
    tenantId: string,
    revisionId: string,
  ): Promise<void> {
    await this.db
      .update(schema.site)
      .set({ currentRevisionId: revisionId, updatedAt: new Date() })
      .where(
        and(eq(schema.site.id, siteId), eq(schema.site.tenantId, tenantId)),
      );
  }
}

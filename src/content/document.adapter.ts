/**
 * `DocumentAdapter` — единственный сегодня адаптер порта `StoreContent`.
 *
 * Ровно путь `SitesDomainService.getRevision()`/`createRevision()` ДО этого
 * порта (см. факты в шапке брифа merfy-mcp/docs/plans/2026-09-23-wave1-content-port.md):
 *   load = выборка ревизии (текущая или по revisionId) → migrateRevisionData →
 *          normalizeRevision (PageResolver) → seedContentPagesFromTheme (B17) →
 *          resolveAssetUrls
 *   save = createRevision: опц. filterSeededPagesOnWrite → insert (+ CAS по
 *          expectedVersion в транзакции, если запрошен) → { version }
 *
 * `site`-метаданные (тема/publicUrl/tenantId/…) приходят ПАРАМЕТРОМ, а не
 * отдельным `SELECT` по `schema.site` — так адаптер остаётся мокаемым теми
 * же тестами, что сегодня мокают `SitesDomainService.get()` напрямую
 * (golden.spec.ts, site-create-theme.characterization.spec.ts,
 * revision-create-cas.spec.ts — у последнего `db`-мок вообще не даёт `select`).
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, isNull } from 'drizzle-orm';
import { PG_CONNECTION } from '../constants';
import * as schema from '../db/schema';
import { migrateRevisionData } from '../utils/revision-migrations';
import { getPageResolver } from '../themes/page-resolver-instance';
import { seedContentPagesFromTheme } from '../themes/content-page-seed';
import { resolveAssetUrls } from '../themes/asset-resolver';
import { filterSeededPagesOnWrite } from '../utils/revision-write-filter';
import type {
  LoadOptions,
  LoadResult,
  SaveParams,
  SaveResult,
  StoreContent,
  StoreContentSite,
} from './store-content.port';

// Тот же флаг, что в sites.service.ts/preview.controller.ts — поведение шага
// normalize не меняется, просто у него теперь собственная копия условия.
const USE_PAGE_RESOLVER = process.env.USE_PAGE_RESOLVER !== 'false';

type StepContext = {
  siteId: string;
  themeId: string | null;
  publicUrl: string | null;
  siteName: string | null;
  logger: Logger;
};

type LoadStep = {
  name: string;
  apply: (
    data: Record<string, unknown>,
    ctx: StepContext,
  ) => Promise<Record<string, unknown>> | Record<string, unknown>;
};

function migrateStep(data: Record<string, unknown>, ctx: StepContext) {
  return migrateRevisionData(data, ctx.themeId, ctx.siteName) as Record<
    string,
    unknown
  >;
}

/**
 * PageResolver.normalizeRevision — домёрдживает метаданные страниц манифеста
 * темы. Сбой не фатален (как в сегодняшнем getRevision): шаг оставляет данные
 * как после migrate и только пишет warn.
 */
function normalizeStep(data: Record<string, unknown>, ctx: StepContext) {
  if (!USE_PAGE_RESOLVER || !ctx.themeId) return data;
  try {
    return getPageResolver(ctx.themeId).normalizeRevision(data) as unknown as Record<
      string,
      unknown
    >;
  } catch (e) {
    ctx.logger.warn(
      `PageResolver.normalizeRevision failed for site ${ctx.siteId}: ${e instanceof Error ? e.message : e}`,
    );
    return data;
  }
}

function seedStep(data: Record<string, unknown>, ctx: StepContext) {
  return seedContentPagesFromTheme(data, ctx.themeId);
}

function resolveStep(data: Record<string, unknown>, ctx: StepContext) {
  return resolveAssetUrls(data, ctx.publicUrl);
}

/**
 * Таблица шагов `load`, не лестница вызовов: новый шаг — новая строка, без
 * правки соседних.
 */
const LOAD_STEPS: LoadStep[] = [
  { name: 'migrate', apply: migrateStep },
  { name: 'normalize', apply: normalizeStep },
  { name: 'seed', apply: seedStep },
  { name: 'resolve', apply: resolveStep },
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

@Injectable()
export class DocumentAdapter implements StoreContent {
  private readonly logger = new Logger(DocumentAdapter.name);

  constructor(
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async load(siteId: string, opts: LoadOptions): Promise<LoadResult> {
    const revisionId = opts.revisionId ?? opts.site.currentRevisionId ?? undefined;
    if (!revisionId) throw new Error('revision_not_found');
    const rev = await this.fetchRevision(revisionId, siteId);
    if (!rev) throw new Error('revision_not_found');
    const ctx: StepContext = {
      siteId,
      themeId: opts.site.themeId,
      publicUrl: opts.site.publicUrl,
      siteName: opts.site.name ?? null,
      logger: this.logger,
    };
    const document = await runLoadSteps(
      rev.data as Record<string, unknown> | undefined,
      ctx,
    );
    return { document, version: revisionId };
  }

  async save(siteId: string, params: SaveParams): Promise<SaveResult> {
    const id = randomUUID();
    const dataToPersist = params.filterSeeded
      ? await this.stripSeededPages(siteId, params.site, params.document)
      : params.document;

    if (params.setCurrent && params.expectedVersion !== undefined) {
      await this.saveWithCas(siteId, id, dataToPersist, params);
      return { version: id };
    }

    await this.insertRevision(id, siteId, dataToPersist, params.meta, params.actorUserId);
    if (params.setCurrent) {
      await this.setCurrentUnconditional(siteId, params.site, id);
    }
    return { version: id };
  }

  // -- load helpers ----------------------------------------------------

  private async fetchRevision(revisionId: string, siteId: string) {
    const [rev] = await this.db
      .select()
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
      const storedPrev = await this.fetchStoredPrev(site.currentRevisionId ?? null);
      const res = await filterSeededPagesOnWrite(
        data,
        storedPrev,
        site.themeId ?? null,
        site.publicUrl ?? null,
      );
      if (res.dropped.length || res.unfrozen.length) {
        this.logger.log(
          `revision write filter site=${siteId}: не вморожено ${res.dropped.length} [${res.dropped.join(',')}], разморожено ${res.unfrozen.length} [${res.unfrozen.join(',')}]`,
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
    site: StoreContentSite,
    revisionId: string,
  ): Promise<void> {
    const tenantId = site.tenantId;
    if (!tenantId) throw new Error('site_tenant_missing');
    await this.db
      .update(schema.site)
      .set({ currentRevisionId: revisionId, updatedAt: new Date() })
      .where(and(eq(schema.site.id, siteId), eq(schema.site.tenantId, tenantId)));
  }

  private async saveWithCas(
    siteId: string,
    id: string,
    data: Record<string, unknown>,
    params: SaveParams,
  ): Promise<void> {
    const tenantId = params.site.tenantId;
    if (!tenantId) throw new Error('site_tenant_missing');
    const expectedCurrentRevisionId = params.expectedVersion as string | null;
    await this.db.transaction(async (tx) => {
      await tx.insert(schema.siteRevision).values({
        id,
        siteId,
        data: data ?? {},
        meta: params.meta ?? {},
        createdAt: new Date(),
        createdBy: params.actorUserId,
      });
      const expectedPredicate =
        expectedCurrentRevisionId === null
          ? isNull(schema.site.currentRevisionId)
          : eq(schema.site.currentRevisionId, expectedCurrentRevisionId);
      const updated = await tx
        .update(schema.site)
        .set({ currentRevisionId: id, updatedAt: new Date() })
        .where(
          and(
            eq(schema.site.id, siteId),
            eq(schema.site.tenantId, tenantId),
            expectedPredicate,
          ),
        )
        .returning({ id: schema.site.id });
      if (updated.length === 0) throw new Error('revision_conflict');
    });
  }
}

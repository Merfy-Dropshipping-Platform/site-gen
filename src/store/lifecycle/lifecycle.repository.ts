/**
 * Хранилище состояния рождения магазина (этап 3, кусок 3.1).
 *
 * Порт — чтобы доводчик и его тесты не зависели от Drizzle: в тестах —
 * `InMemoryLifecycleRepository` (`src/store/__tests__/support/`), в сервисе —
 * `DrizzleLifecycleRepository` ниже. Семантику захвата оба обязаны держать
 * одинаково: это проверяет общий набор `src/store/__tests__/store.pg.spec.ts`
 * на настоящем Postgres и тесты доводчика на памяти.
 *
 * Правила выборки (решение плана, И7):
 *   - доводчик видит ТОЛЬКО строки с непустым `lifecycle` — магазины, рождённые
 *     командой `CreateStore`. Старые магазины (`lifecycle IS NULL`) обслуживают
 *     старые cron, как раньше, и доводчик их не трогает;
 *   - `ready` и удалённые (`deleted_at`) не выбираются.
 *
 * Время — только часы базы (`now()`): у реплик сервиса часы могут разойтись,
 * у базы они одни.
 */
import { Inject, Injectable } from "@nestjs/common";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, isNull, sql } from "drizzle-orm";
import { PG_CONNECTION } from "../../constants";
import * as schema from "../../db/schema";
import type { LifecycleRecord, LifecycleState } from "./store-lifecycle";

export interface LifecycleRow {
  id: string;
  tenantId: string;
  name: string;
  slug: string | null;
  status: string;
  themeId: string | null;
  createdBy: string | null;
  publicUrl: string | null;
  storageSlug: string | null;
  currentRevisionId: string | null;
  domainId: string | null;
  coolifyProjectUuid: string | null;
  coolifyAppUuid: string | null;
  contentModel: string | null;
  lifecycle: LifecycleState | null;
  lifecycleError: string | null;
  lifecycleAttempts: number | null;
  lifecycleNextAt: Date | null;
}

export interface LifecycleRepository {
  /**
   * Атомарно взять строку в работу на `leaseMs`: успех только если строка
   * рождается командой (`lifecycle` не пуст), не готова, не удалена и её время
   * пришло (`lifecycle_next_at` пуст или в прошлом). Два одновременных захвата
   * одной строки — выигрывает ровно один.
   */
  claim(siteId: string, leaseMs: number): Promise<LifecycleRow | null>;
  read(siteId: string): Promise<LifecycleRow | null>;
  /**
   * Строка магазина этого тенанта, не удалённая, — для запроса состояния
   * снаружи (`sites.query.store_status`). Граница тенанта — в самом запросе.
   */
  readOwned(tenantId: string, siteId: string): Promise<LifecycleRow | null>;
  record(siteId: string, record: LifecycleRecord): Promise<void>;
  /** id строк, которые пора двигать (старые — первыми). */
  listDue(limit: number): Promise<string[]>;
}

export const LIFECYCLE_REPOSITORY = Symbol("LIFECYCLE_REPOSITORY");

const ROW = {
  id: schema.site.id,
  tenantId: schema.site.tenantId,
  name: schema.site.name,
  slug: schema.site.slug,
  status: schema.site.status,
  themeId: schema.site.themeId,
  createdBy: schema.site.createdBy,
  publicUrl: schema.site.publicUrl,
  storageSlug: schema.site.storageSlug,
  currentRevisionId: schema.site.currentRevisionId,
  domainId: schema.site.domainId,
  coolifyProjectUuid: schema.site.coolifyProjectUuid,
  coolifyAppUuid: schema.site.coolifyAppUuid,
  contentModel: schema.site.contentModel,
  lifecycle: schema.site.lifecycle,
  lifecycleError: schema.site.lifecycleError,
  lifecycleAttempts: schema.site.lifecycleAttempts,
  lifecycleNextAt: schema.site.lifecycleNextAt,
};

/** Строка рождается командой и ещё не готова — общая часть захвата и выборки. */
const inFlight = sql`${schema.site.lifecycle} IS NOT NULL AND ${schema.site.lifecycle} <> 'ready' AND ${schema.site.deletedAt} IS NULL`;
const due = sql`(${schema.site.lifecycleNextAt} IS NULL OR ${schema.site.lifecycleNextAt} <= now())`;

function nextAtSql(policy: LifecycleRecord["nextAt"]) {
  if (policy === "clear") return sql`NULL`;
  if (policy === "keep") return sql`${schema.site.lifecycleNextAt}`;
  return sql`now() + make_interval(secs => ${policy.inMs / 1000})`;
}

@Injectable()
export class DrizzleLifecycleRepository implements LifecycleRepository {
  constructor(
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async claim(siteId: string, leaseMs: number): Promise<LifecycleRow | null> {
    // Один условный UPDATE: в READ COMMITTED второй конкурент ждёт блокировку
    // строки и перепроверяет WHERE уже по новой версии — `lifecycle_next_at`
    // в будущем, строка ему не достаётся.
    const rows = await this.db
      .update(schema.site)
      .set({
        lifecycleNextAt: sql`now() + make_interval(secs => ${leaseMs / 1000})`,
      })
      .where(and(eq(schema.site.id, siteId), inFlight, due))
      .returning(ROW);
    return (rows[0] as LifecycleRow | undefined) ?? null;
  }

  async read(siteId: string): Promise<LifecycleRow | null> {
    const rows = await this.db
      .select(ROW)
      .from(schema.site)
      .where(eq(schema.site.id, siteId))
      .limit(1);
    return (rows[0] as LifecycleRow | undefined) ?? null;
  }

  async readOwned(
    tenantId: string,
    siteId: string,
  ): Promise<LifecycleRow | null> {
    const rows = await this.db
      .select(ROW)
      .from(schema.site)
      .where(
        and(
          eq(schema.site.id, siteId),
          eq(schema.site.tenantId, tenantId),
          isNull(schema.site.deletedAt),
        ),
      )
      .limit(1);
    return (rows[0] as LifecycleRow | undefined) ?? null;
  }

  async record(siteId: string, record: LifecycleRecord): Promise<void> {
    await this.db
      .update(schema.site)
      .set({
        lifecycle: record.state,
        lifecycleError: record.error,
        lifecycleAttempts: record.attempts,
        lifecycleNextAt: nextAtSql(record.nextAt),
      })
      .where(eq(schema.site.id, siteId));
  }

  async listDue(limit: number): Promise<string[]> {
    const rows = await this.db
      .select({ id: schema.site.id })
      .from(schema.site)
      .where(and(inFlight, due))
      .orderBy(
        sql`${schema.site.lifecycleNextAt} NULLS FIRST`,
        schema.site.createdAt,
      )
      .limit(limit);
    return rows.map((r) => r.id);
  }
}

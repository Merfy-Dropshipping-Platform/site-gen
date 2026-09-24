/**
 * Реестр магазинов для команды `CreateStore` (этап 3, кусок 3.2).
 *
 * Лимит магазинов проверяется ОДИН раз и под блокировкой тенанта: подсчёт,
 * проверка «у тенанта ещё нет магазинов», выбор слага и вставка строки идут в
 * одной транзакции под `pg_advisory_xact_lock` по ключу тенанта. Две
 * одновременные команды одного тенанта у лимита — вторая ждёт коммита первой и
 * видит уже её магазин (проверяет `src/store/__tests__/store.pg.spec.ts` на настоящем
 * Postgres и `create-store.command.spec.ts` на памяти).
 *
 * Биллинг спрашивается ДО блокировки: права тарифа не зависят от наших
 * вставок, а держать транзакцию на время RPC незачем.
 */
import { Inject, Injectable } from "@nestjs/common";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, ilike, sql } from "drizzle-orm";
import { PG_CONNECTION } from "../constants";
import * as schema from "../db/schema";

export interface NewStoreRow {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  themeId: string;
  actorUserId: string;
}

/**
 * `any` — все неудалённые магазины тенанта (как считали регистрация и cron
 * «пользователи без магазина»); `counted` — те, что идут в лимит тарифа (как
 * считал `reserve()`: без удалённых и архивных).
 */
export type StoreCountScope = "any" | "counted";

export interface StoreRegistryTx {
  countStores(tenantId: string, scope: StoreCountScope): Promise<number>;
  slugTaken(tenantId: string, slug: string): Promise<boolean>;
  /** Новая строка сразу в саге: `lifecycle = 'reserved'` — её ведёт доводчик, не старые cron. */
  insertStore(row: NewStoreRow): Promise<void>;
}

export interface StoreRegistry {
  withTenantLock<T>(
    tenantId: string,
    work: (tx: StoreRegistryTx) => Promise<T>,
  ): Promise<T>;
}

export const STORE_REGISTRY = Symbol("STORE_REGISTRY");

type Tx = Parameters<
  Parameters<NodePgDatabase<typeof schema>["transaction"]>[0]
>[0];

const COUNT_SCOPES: Record<StoreCountScope, ReturnType<typeof sql>> = {
  any: sql`${schema.site.deletedAt} IS NULL`,
  counted: sql`${schema.site.deletedAt} IS NULL AND ${schema.site.status} != 'archived'`,
};

class DrizzleStoreRegistryTx implements StoreRegistryTx {
  constructor(private readonly tx: Tx) {}

  async countStores(tenantId: string, scope: StoreCountScope): Promise<number> {
    const rows = await this.tx
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.site)
      .where(and(eq(schema.site.tenantId, tenantId), COUNT_SCOPES[scope]));
    return rows[0]?.count ?? 0;
  }

  async slugTaken(tenantId: string, slug: string): Promise<boolean> {
    const rows = await this.tx
      .select({ id: schema.site.id })
      .from(schema.site)
      .where(
        and(eq(schema.site.tenantId, tenantId), ilike(schema.site.slug, slug)),
      )
      .limit(1);
    return rows.length > 0;
  }

  async insertStore(row: NewStoreRow): Promise<void> {
    const now = new Date();
    await this.tx.insert(schema.site).values({
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      slug: row.slug,
      status: "draft",
      themeId: row.themeId,
      createdAt: now,
      updatedAt: now,
      createdBy: row.actorUserId,
      updatedBy: row.actorUserId,
      lifecycle: "reserved",
      lifecycleAttempts: 0,
    });
  }
}

@Injectable()
export class DrizzleStoreRegistry implements StoreRegistry {
  constructor(
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async withTenantLock<T>(
    tenantId: string,
    work: (tx: StoreRegistryTx) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (tx) => {
      // Транзакционная блокировка: снимается сама на COMMIT/ROLLBACK, в пуле
      // соединений не «протекает» между запросами.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`sites:create_store:${tenantId}`}, 0))`,
      );
      return work(new DrizzleStoreRegistryTx(tx));
    });
  }
}

/**
 * Сага рождения на НАСТОЯЩЕМ Postgres (этап 3).
 *
 * Тесты доводчика и команд на памяти проверяют логику; здесь — то, что память
 * только моделирует: условный UPDATE захвата строки, выборку созревших строк,
 * изоляцию старых cron от строк саги, блокировку тенанта при создании.
 *
 * Нужна пустая база: `SITES_TEST_DATABASE_URL=postgres://…/<тестовая_бд>`.
 * Схема накатывается теми же миграциями drizzle, что в проде (`drizzle/`),
 * включая 0018 — заодно проверка, что миграция применяется. Без переменной
 * набор пропускается С ПРЕДУПРЕЖДЕНИЕМ (в CI переменная задана в build-and-test
 * на сервисном Postgres). Прод и общие базы сюда не подключать.
 */
import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { DrizzleLifecycleRepository } from "../lifecycle/lifecycle.repository";
import { SitesDomainService } from "../../sites.service";
import { StoreLifecycleReconciler } from "../lifecycle/store-lifecycle.reconciler";
import { CreateStoreCommand } from "../commands/create-store.command";
import { DrizzleStoreRegistry } from "../store-registry";
import { DbThemeCatalog } from "../theme-catalog";
import { THEMES, catalogOf } from "./support/create-store-harness";

const url = process.env.SITES_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
if (!url) {
  console.warn(
    "store.pg.spec: SITES_TEST_DATABASE_URL не задан — проверки на настоящем Postgres ПРОПУЩЕНЫ",
  );
}

let pool: InstanceType<typeof Pool>;
let db: NodePgDatabase<typeof schema>;

async function insertSite(
  values: Partial<typeof schema.site.$inferInsert> & { id: string },
) {
  await db.insert(schema.site).values({
    tenantId: "pg-t1",
    name: values.id,
    status: "draft",
    ...values,
  });
}

suite("сага рождения на настоящем Postgres", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: url, max: 6 });
    db = drizzle(pool, { schema });
    await migrate(db, {
      migrationsFolder: resolve(__dirname, "..", "..", "..", "drizzle"),
    });
  });

  afterAll(async () => {
    await pool?.end();
  });

  beforeEach(async () => {
    await db.delete(schema.site);
  });

  describe("DrizzleLifecycleRepository", () => {
    it("два одновременных захвата одной строки — выигрывает ровно один", async () => {
      await insertSite({
        id: "claim-1",
        lifecycle: "reserved",
        lifecycleAttempts: 0,
      });
      const a = new DrizzleLifecycleRepository(drizzle(pool, { schema }));
      const b = new DrizzleLifecycleRepository(drizzle(pool, { schema }));

      const results = await Promise.all([
        a.claim("claim-1", 60_000),
        b.claim("claim-1", 60_000),
        a.claim("claim-1", 60_000),
        b.claim("claim-1", 60_000),
      ]);

      expect(results.filter(Boolean)).toHaveLength(1);
    });

    it("захват ставит аренду по часам базы; пока аренда идёт, строка не созревшая", async () => {
      await insertSite({
        id: "lease-1",
        lifecycle: "seeded",
        lifecycleAttempts: 0,
      });
      const repo = new DrizzleLifecycleRepository(db);

      const claimed = await repo.claim("lease-1", 60_000);

      expect(claimed?.id).toBe("lease-1");
      const leaseMs = claimed!.lifecycleNextAt!.getTime() - Date.now();
      expect(leaseMs).toBeGreaterThan(50_000);
      expect(leaseMs).toBeLessThan(70_000);
      expect(await repo.listDue(10)).toEqual([]);
      expect(await repo.claim("lease-1", 60_000)).toBeNull();
    });

    it("выборка: только строки саги, не готовые, не удалённые, чьё время пришло", async () => {
      const past = new Date(Date.now() - 60_000);
      const future = new Date(Date.now() + 60_000);
      await insertSite({ id: "legacy", lifecycle: null });
      await insertSite({
        id: "fresh",
        lifecycle: "reserved",
        lifecycleAttempts: 0,
      });
      await insertSite({
        id: "retry-due",
        lifecycle: "failed",
        lifecycleAttempts: 2,
        lifecycleNextAt: past,
      });
      await insertSite({
        id: "retry-later",
        lifecycle: "failed",
        lifecycleAttempts: 1,
        lifecycleNextAt: future,
      });
      await insertSite({
        id: "done",
        lifecycle: "ready",
        lifecycleAttempts: 0,
      });
      await insertSite({
        id: "gone",
        lifecycle: "seeded",
        deletedAt: new Date(),
      });
      const repo = new DrizzleLifecycleRepository(db);

      expect(new Set(await repo.listDue(10))).toEqual(
        new Set(["fresh", "retry-due"]),
      );
      expect(await repo.claim("legacy", 60_000)).toBeNull();
      expect(await repo.claim("done", 60_000)).toBeNull();
      expect(await repo.claim("gone", 60_000)).toBeNull();
      expect(await repo.claim("retry-later", 60_000)).toBeNull();
    });

    it("запись исхода: пауза повтора по часам базы, «keep» не трогает аренду, «clear» снимает", async () => {
      await insertSite({
        id: "rec-1",
        lifecycle: "reserved",
        lifecycleAttempts: 0,
      });
      const repo = new DrizzleLifecycleRepository(db);
      const claimed = await repo.claim("rec-1", 60_000);

      await repo.record("rec-1", {
        state: "seeded",
        error: null,
        attempts: 0,
        nextAt: "keep",
      });
      expect((await repo.read("rec-1"))!.lifecycleNextAt!.getTime()).toBe(
        claimed!.lifecycleNextAt!.getTime(),
      );

      await repo.record("rec-1", {
        state: "failed",
        error: "provision: REG.RU timeout",
        attempts: 1,
        nextAt: { inMs: 30_000 },
      });
      const failed = (await repo.read("rec-1"))!;
      expect(failed).toMatchObject({
        lifecycle: "failed",
        lifecycleError: "provision: REG.RU timeout",
        lifecycleAttempts: 1,
      });
      const pauseMs = failed.lifecycleNextAt!.getTime() - Date.now();
      expect(pauseMs).toBeGreaterThan(20_000);
      expect(pauseMs).toBeLessThan(40_000);

      await repo.record("rec-1", {
        state: "ready",
        error: null,
        attempts: 0,
        nextAt: "clear",
      });
      expect((await repo.read("rec-1"))!.lifecycleNextAt).toBeNull();
    });
  });

  describe("CreateStore на настоящем Postgres (блокировка тенанта + доводчик)", () => {
    /** Шаги саги пишут факты прямо в строку — как настоящие, без внешних служб. */
    const steps = {
      seed: async (row: { id: string }) => {
        await db
          .update(schema.site)
          .set({ currentRevisionId: `rev-${row.id}` })
          .where(eq(schema.site.id, row.id));
      },
      provision: async (row: { id: string }) => {
        await db
          .update(schema.site)
          .set({
            domainId: `dom-${row.id}`,
            coolifyProjectUuid: "proj-pg",
            publicUrl: `https://${row.id.slice(0, 8)}.merfy.ru`,
            storageSlug: row.id.slice(0, 8),
          })
          .where(eq(schema.site.id, row.id));
      },
      route: async (row: { id: string }) => {
        await db
          .update(schema.site)
          .set({ coolifyAppUuid: "central-proxy" })
          .where(eq(schema.site.id, row.id));
      },
    };

    /** Отдельная команда на своём drizzle — как две реплики сервиса. */
    function makeCommand(shopsLimit: number) {
      const own = drizzle(pool, { schema });
      const repo = new DrizzleLifecycleRepository(own);
      const reconciler = new StoreLifecycleReconciler(repo, steps);
      const billing = {
        readEntitlements: async () => ({
          entitlements: { shopsLimit, staffLimit: 1, frozen: false },
          known: true,
        }),
      };
      return new CreateStoreCommand(
        new DrizzleStoreRegistry(own),
        catalogOf(THEMES),
        billing as any,
        reconciler,
        repo,
        { emit: () => undefined } as any,
      );
    }

    const tenantRows = async (tenantId: string) =>
      db.select().from(schema.site).where(eq(schema.site.tenantId, tenantId));

    it("две одновременные команды у лимита 1 — одна создала, вторая shops_limit_reached", async () => {
      const [a, b] = await Promise.all([
        makeCommand(1).execute({
          tenantId: "pg-lim",
          actorUserId: "u1",
          name: "Первый",
          wait: true,
        }),
        makeCommand(1).execute({
          tenantId: "pg-lim",
          actorUserId: "u2",
          name: "Второй",
          wait: true,
        }),
      ]);

      const outcomes = [a, b]
        .map((r) => (r.ok ? "created" : r.error.code))
        .sort();
      expect(outcomes).toEqual(["created", "shops_limit_reached"]);
      expect(await tenantRows("pg-lim")).toHaveLength(1);
    });

    it("регистрация и cron одновременно для нового тенанта — магазин ровно один", async () => {
      await Promise.all([
        makeCommand(5).execute({
          tenantId: "pg-new",
          actorUserId: "u1",
          name: "Мой сайт",
          ifNoStores: true,
          source: "registration",
        }),
        makeCommand(5).execute({
          tenantId: "pg-new",
          actorUserId: "u1",
          name: "Мой магазин",
          ifNoStores: true,
          source: "missing-store",
        }),
      ]);
      expect(await tenantRows("pg-new")).toHaveLength(1);
    });

    it("магазин рождается в саге: тема из команды, слаг транслитом, доведён до ready", async () => {
      const result = await makeCommand(5).execute({
        tenantId: "pg-saga",
        actorUserId: "u1",
        name: "Мой Магазин",
        themeId: "satin",
        wait: true,
      });

      expect(result.ok && result.effect.ready).toBe(true);
      const [row] = await tenantRows("pg-saga");
      expect(row).toMatchObject({
        themeId: "satin",
        slug: "moy-magazin",
        status: "draft",
        lifecycle: "ready",
        lifecycleAttempts: 0,
        lifecycleNextAt: null,
        coolifyAppUuid: "central-proxy",
      });
    });
  });

  describe("каталог тем на настоящем Postgres (миграция 0019)", () => {
    it("пять тем витрины с «подходит для»; default и чужая своя тема скрыты", async () => {
      await db.delete(schema.theme);
      const row = (
        id: string,
        extra: Partial<typeof schema.theme.$inferInsert> = {},
      ) => ({
        id,
        name: id,
        slug: id,
        templateId: `${id}-1.0`,
        isActive: true,
        ...extra,
      });
      await db
        .insert(schema.theme)
        .values([
          row("rose", { fitsFor: ["Одежда"], previewDesktop: "/img/rose.png" }),
          row("default"),
          row("flux", { ownerTenantId: "other-tenant" }),
          row("satin", { isActive: false }),
        ]);

      const catalog = new DbThemeCatalog(db);
      const list = await catalog.list("pg-t1");

      expect(list.map((t) => t.id)).toEqual(["rose"]);
      expect(list[0]).toMatchObject({
        fitsFor: ["Одежда"],
        previewDesktop: "/img/rose.png",
        ownerTenantId: null,
        baseThemeId: null,
      });
      expect(
        (await catalog.list("other-tenant")).map((t) => t.id).sort(),
      ).toEqual(["flux", "rose"]);
    });
  });

  describe("старые cron и строки саги", () => {
    function reaperWith(touched: string[]) {
      const domainClient = {
        generateSubdomain: jest.fn(async (tenantId: string) => {
          touched.push(tenantId);
          return { id: `dom-${tenantId}`, name: `${tenantId}.merfy.ru` };
        }),
      };
      const storage = {
        getSitePublicUrlBySubdomain: (s: string) => `https://${s}`,
        extractSubdomainSlug: (u: string) =>
          u.replace(/^https?:\/\//, "").split(".")[0],
      };
      const deployments = {
        centralProxyEnabled: true,
        ensureCentralRouter: jest.fn(async () => "ok"),
      };
      const dep = {} as any;
      const service = new SitesDomainService(
        db,
        dep,
        dep,
        dep,
        deployments as any,
        storage as any,
        domainClient as any,
        dep,
        dep,
      );
      jest
        .spyOn(service, "getOrCreateTenantProject")
        .mockResolvedValue("proj-1" as any);
      return service;
    }

    it("reaper довыполняет старый магазин и не трогает магазин в саге", async () => {
      await insertSite({
        id: "old-orphan",
        tenantId: "old-tenant",
        lifecycle: null,
      });
      await insertSite({
        id: "saga-orphan",
        tenantId: "saga-tenant",
        lifecycle: "seeded",
        lifecycleAttempts: 0,
      });
      const touched: string[] = [];

      const result = await reaperWith(touched).migrateOrphanedSites();

      expect(result.migrated).toBe(1);
      expect(touched).toEqual(["old-tenant"]);
      const [saga] = await db
        .select()
        .from(schema.site)
        .where(eq(schema.site.id, "saga-orphan"));
      expect(saga).toMatchObject({
        domainId: null,
        publicUrl: null,
        coolifyAppUuid: null,
        lifecycle: "seeded",
      });
    });

    it("clearMockCache не обнуляет проект у магазина в саге", async () => {
      await insertSite({
        id: "old-mock",
        lifecycle: null,
        coolifyProjectUuid: "mock-project-1",
      });
      await insertSite({
        id: "saga-mock",
        lifecycle: "ready",
        coolifyProjectUuid: "mock-project-2",
      });

      await reaperWith([]).clearMockCache();

      const rows = await db
        .select({ id: schema.site.id, p: schema.site.coolifyProjectUuid })
        .from(schema.site);
      expect(Object.fromEntries(rows.map((r) => [r.id, r.p]))).toEqual({
        "old-mock": null,
        "saga-mock": "mock-project-2",
      });
    });
  });
});

/**
 * Сага рождения на НАСТОЯЩЕМ Postgres (этап 3).
 *
 * Тесты доводчика и команд на памяти проверяют логику; здесь — то, что память
 * только моделирует: условный UPDATE захвата строки, выборку созревших строк,
 * изоляцию старых cron от строк саги, блокировку тенанта при создании, CAS
 * ревизии при смене темы.
 *
 * База — `SITES_TEST_DATABASE_URL`, только одноразовая: подключение даёт
 * `openDisposableDatabase` (support/test-database.ts), она отказывает, если в
 * имени базы нет «test», создаёт базу при необходимости и накатывает миграции
 * drizzle (заодно проверка, что 0018/0019 применяются на чистой базе). Без
 * переменной набор пропускается С ПРЕДУПРЕЖДЕНИЕМ; в CI она задана в
 * build-and-test (эфемерная `sites_stage3_test`).
 *
 * Следов не оставляет: все id и тенанты тестов начинаются с `stage3-pg-`,
 * удаляются только такие строки. Тесты, которые зовут запросы по всей таблице
 * (reaper, clearMockCache, каталог тем), идут в транзакции с откатом — чужие
 * строки они не меняют даже на время прогона вне своей транзакции.
 */
import type { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, inArray, like, or } from "drizzle-orm";
import * as schema from "../../db/schema";
import { DrizzleLifecycleRepository } from "../lifecycle/lifecycle.repository";
import { SitesDomainService } from "../../sites.service";
import { StoreLifecycleReconciler } from "../lifecycle/store-lifecycle.reconciler";
import { CreateStoreCommand } from "../commands/create-store.command";
import { DrizzleStoreRegistry, type StoreRegistryTx } from "../store-registry";
import { LEASE_MS } from "../lifecycle/store-lifecycle";
import { DbThemeCatalog } from "../theme-catalog";
import { SetThemeCommand } from "../theme-switch/set-theme.command";
import { DocumentAdapter } from "../../content/document.adapter";
import { THEMES, catalogOf } from "./support/create-store-harness";
import { openDisposableDatabase } from "./support/test-database";

type Db = NodePgDatabase<typeof schema>;

const url = process.env.SITES_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
if (!url) {
  console.warn(
    "store.pg.spec: SITES_TEST_DATABASE_URL не задан — проверки на настоящем Postgres ПРОПУЩЕНЫ",
  );
}

/** Префикс всех id и тенантов этого набора: удаляются только такие строки. */
const P = "stage3-pg-";
const own = (id: string) => `${P}${id}`;

let pool: InstanceType<typeof Pool>;
let db: Db;

async function insertSite(
  values: Partial<typeof schema.site.$inferInsert> & { id: string },
  into: Db = db,
) {
  await into.insert(schema.site).values({
    tenantId: own("t1"),
    name: values.id,
    status: "draft",
    ...values,
  });
}

async function removeOwnRows() {
  await db
    .delete(schema.siteRevision)
    .where(like(schema.siteRevision.siteId, `${P}%`));
  await db
    .delete(schema.site)
    .where(
      or(like(schema.site.id, `${P}%`), like(schema.site.tenantId, `${P}%`)),
    );
}

const ROLLBACK = new Error("откат: тест не оставляет следов");

/** Работа в транзакции, которая всегда откатывается. */
async function inRolledBackTx(work: (tx: Db) => Promise<void>) {
  await db
    .transaction(async (tx) => {
      await work(tx as unknown as Db);
      throw ROLLBACK;
    })
    .catch((e: unknown) => {
      if (e !== ROLLBACK) throw e;
    });
}

suite("сага рождения на настоящем Postgres", () => {
  beforeAll(async () => {
    ({ pool, db } = await openDisposableDatabase(url!));
    await removeOwnRows();
  });

  afterAll(async () => {
    if (db) await removeOwnRows();
    await pool?.end();
  });

  beforeEach(removeOwnRows);

  describe("DrizzleLifecycleRepository", () => {
    it("два одновременных захвата одной строки — выигрывает ровно один", async () => {
      await insertSite({
        id: own("claim-1"),
        lifecycle: "reserved",
        lifecycleAttempts: 0,
      });
      const a = new DrizzleLifecycleRepository(drizzle(pool, { schema }));
      const b = new DrizzleLifecycleRepository(drizzle(pool, { schema }));

      const results = await Promise.all([
        a.claim(own("claim-1"), 60_000),
        b.claim(own("claim-1"), 60_000),
        a.claim(own("claim-1"), 60_000),
        b.claim(own("claim-1"), 60_000),
      ]);

      expect(results.filter(Boolean)).toHaveLength(1);
    });

    it("захват ставит аренду по часам базы; пока аренда идёт, строка не созревшая", async () => {
      await insertSite({
        id: own("lease-1"),
        lifecycle: "seeded",
        lifecycleAttempts: 0,
      });
      const repo = new DrizzleLifecycleRepository(db);

      const claimed = await repo.claim(own("lease-1"), 60_000);

      expect(claimed?.id).toBe(own("lease-1"));
      const leaseMs = claimed!.lifecycleNextAt!.getTime() - Date.now();
      expect(leaseMs).toBeGreaterThan(50_000);
      expect(leaseMs).toBeLessThan(70_000);
      expect(await repo.listDue(1000)).not.toContain(own("lease-1"));
      expect(await repo.claim(own("lease-1"), 60_000)).toBeNull();
    });

    it("выборка: только строки саги, не готовые, не удалённые, чьё время пришло", async () => {
      const past = new Date(Date.now() - 60_000);
      const future = new Date(Date.now() + 60_000);
      await insertSite({ id: own("legacy"), lifecycle: null });
      await insertSite({
        id: own("fresh"),
        lifecycle: "reserved",
        lifecycleAttempts: 0,
      });
      await insertSite({
        id: own("retry-due"),
        lifecycle: "failed",
        lifecycleAttempts: 2,
        lifecycleNextAt: past,
      });
      await insertSite({
        id: own("retry-later"),
        lifecycle: "failed",
        lifecycleAttempts: 1,
        lifecycleNextAt: future,
      });
      await insertSite({
        id: own("done"),
        lifecycle: "ready",
        lifecycleAttempts: 0,
      });
      await insertSite({
        id: own("gone"),
        lifecycle: "seeded",
        deletedAt: new Date(),
      });
      const repo = new DrizzleLifecycleRepository(db);

      const due = (await repo.listDue(1000)).filter((id) => id.startsWith(P));
      expect(new Set(due)).toEqual(new Set([own("fresh"), own("retry-due")]));
      expect(await repo.claim(own("legacy"), 60_000)).toBeNull();
      expect(await repo.claim(own("done"), 60_000)).toBeNull();
      expect(await repo.claim(own("gone"), 60_000)).toBeNull();
      expect(await repo.claim(own("retry-later"), 60_000)).toBeNull();
    });

    it("запись исхода: пауза повтора по часам базы, «keep» не трогает аренду, «clear» снимает", async () => {
      await insertSite({
        id: own("rec-1"),
        lifecycle: "reserved",
        lifecycleAttempts: 0,
      });
      const repo = new DrizzleLifecycleRepository(db);
      const claimed = await repo.claim(own("rec-1"), 60_000);

      await repo.record(own("rec-1"), {
        state: "seeded",
        error: null,
        attempts: 0,
        nextAt: "keep",
      });
      expect((await repo.read(own("rec-1")))!.lifecycleNextAt!.getTime()).toBe(
        claimed!.lifecycleNextAt!.getTime(),
      );

      await repo.record(own("rec-1"), {
        state: "failed",
        error: "provision: REG.RU timeout",
        attempts: 1,
        nextAt: { inMs: 30_000 },
      });
      const failed = (await repo.read(own("rec-1")))!;
      expect(failed).toMatchObject({
        lifecycle: "failed",
        lifecycleError: "provision: REG.RU timeout",
        lifecycleAttempts: 1,
      });
      const pauseMs = failed.lifecycleNextAt!.getTime() - Date.now();
      expect(pauseMs).toBeGreaterThan(20_000);
      expect(pauseMs).toBeLessThan(40_000);

      await repo.record(own("rec-1"), {
        state: "ready",
        error: null,
        attempts: 0,
        nextAt: "clear",
      });
      expect((await repo.read(own("rec-1")))!.lifecycleNextAt).toBeNull();
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
    function makeCommand(
      shopsLimit: number,
      adjust: (registry: DrizzleStoreRegistry) => void = () => undefined,
    ) {
      const own = drizzle(pool, { schema });
      const repo = new DrizzleLifecycleRepository(own);
      const reconciler = new StoreLifecycleReconciler(repo, steps);
      const billing = {
        readEntitlements: async () => ({
          entitlements: { shopsLimit, staffLimit: 1, frozen: false },
          known: true,
        }),
      };
      const registry = new DrizzleStoreRegistry(own);
      adjust(registry);
      return new CreateStoreCommand(
        registry,
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
          tenantId: own("lim"),
          actorUserId: "u1",
          name: "Первый",
          wait: true,
        }),
        makeCommand(1).execute({
          tenantId: own("lim"),
          actorUserId: "u2",
          name: "Второй",
          wait: true,
        }),
      ]);

      const outcomes = [a, b]
        .map((r) => (r.ok ? "created" : r.error.code))
        .sort();
      expect(outcomes).toEqual(["created", "shops_limit_reached"]);
      expect(await tenantRows(own("lim"))).toHaveLength(1);
    });

    it("регистрация и cron одновременно для нового тенанта — магазин ровно один", async () => {
      await Promise.all([
        makeCommand(5).execute({
          tenantId: own("new"),
          actorUserId: "u1",
          name: "Мой сайт",
          ifNoStores: true,
          source: "registration",
        }),
        makeCommand(5).execute({
          tenantId: own("new"),
          actorUserId: "u1",
          name: "Мой магазин",
          ifNoStores: true,
          source: "missing-store",
        }),
      ]);
      expect(await tenantRows(own("new"))).toHaveLength(1);
    });

    it("строка рождается арендованной командой: тик между вставкой и сидом её не берёт (В3)", async () => {
      const tick = new DrizzleLifecycleRepository(drizzle(pool, { schema }));
      const competing: unknown[] = [];
      const command = makeCommand(5, (registry) => {
        const lockAndInsert = registry.withTenantLock.bind(registry);
        registry.withTenantLock = async <T>(
          tenantId: string,
          work: (tx: StoreRegistryTx) => Promise<T>,
        ): Promise<T> => {
          const reservation = await lockAndInsert(tenantId, work);
          // Тик «успел» между коммитом вставки и сидом команды.
          for (const row of await tenantRows(own("race"))) {
            competing.push(await tick.claim(row.id, LEASE_MS));
          }
          return reservation;
        };
      });

      const result = await command.execute({
        tenantId: own("race"),
        actorUserId: "u1",
        name: "Гонка",
      });

      expect(competing).toEqual([null]);
      expect(result.ok && result.effect.store!.lifecycle.state).toBe("seeded");
      expect(
        (await tenantRows(own("race")))[0].currentRevisionId,
      ).not.toBeNull();
      await command.settle();
      expect((await tenantRows(own("race")))[0]).toMatchObject({
        lifecycle: "ready",
        lifecycleNextAt: null,
      });
    });

    it("магазин рождается в саге: тема из команды, слаг транслитом, доведён до ready", async () => {
      const result = await makeCommand(5).execute({
        tenantId: own("saga"),
        actorUserId: "u1",
        name: "Мой Магазин",
        themeId: "satin",
        wait: true,
      });

      expect(result.ok && result.effect.ready).toBe(true);
      const [row] = await tenantRows(own("saga"));
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
    const FIXTURE = ["rose", "default", "flux", "satin"];

    it("пять тем витрины с «подходит для»; default и чужая своя тема скрыты", async () => {
      await inRolledBackTx(async (tx) => {
        await tx.delete(schema.theme).where(inArray(schema.theme.id, FIXTURE));
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
        await tx.insert(schema.theme).values([
          row("rose", {
            fitsFor: ["Одежда"],
            previewDesktop: "/img/rose.png",
          }),
          row("default"),
          row("flux", { ownerTenantId: own("other-tenant") }),
          row("satin", { isActive: false }),
        ]);
        const catalog = new DbThemeCatalog(tx);
        const ids = async (tenantId: string) =>
          (await catalog.list(tenantId))
            .map((t) => t.id)
            .filter((id) => FIXTURE.includes(id))
            .sort();

        expect(await ids(own("t1"))).toEqual(["rose"]);
        expect(await ids(own("other-tenant"))).toEqual(["flux", "rose"]);
        expect(await catalog.find("rose", own("t1"))).toMatchObject({
          fitsFor: ["Одежда"],
          previewDesktop: "/img/rose.png",
          ownerTenantId: null,
          baseThemeId: null,
        });
      });
    });
  });

  describe("SetTheme на настоящем Postgres (порт StoreContent, CAS, строка магазина)", () => {
    it("rose → flux: новая ревизия текущей, тема и дата выбора в строке, своя страница переехала", async () => {
      const dep = {} as any;
      const sites = new SitesDomainService(
        db,
        dep,
        dep,
        { emit: () => undefined } as any,
        dep,
        dep,
        dep,
        dep,
        dep,
      );
      const canon: any = JSON.parse(
        JSON.stringify(await sites.buildInitialRevision("rose")),
      );
      canon.pages.push({
        id: "p-blog",
        name: "Блог",
        slug: "/blog",
        role: "custom",
        isCustom: true,
        source: "user",
        seo: null,
        locale: null,
        variant: null,
        schedule: null,
        permissions: null,
        targeting: null,
      });
      canon.pagesData["p-blog"] = { text: "Новости" };
      await insertSite({
        id: own("theme"),
        themeId: "rose",
        currentRevisionId: own("rev-0"),
      });
      await db.insert(schema.siteRevision).values({
        id: own("rev-0"),
        siteId: own("theme"),
        data: canon,
        meta: {},
      });
      const command = new SetThemeCommand(
        sites,
        new DocumentAdapter(db),
        {
          defaultThemeId: "rose",
          list: async () => [],
          find: async (id: string) => ({ id }) as any,
        },
        { emit: () => undefined } as any,
      );

      const result = await command.execute({
        tenantId: own("t1"),
        siteId: own("theme"),
        themeId: "flux",
        actorUserId: "u1",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const [site] = await db
        .select()
        .from(schema.site)
        .where(eq(schema.site.id, own("theme")));
      expect(site).toMatchObject({
        themeId: "flux",
        currentRevisionId: result.effect.revisionId,
        updatedBy: "u1",
      });
      expect(site.themeAppliedAt).toBeInstanceOf(Date);
      const [rev] = await db
        .select()
        .from(schema.siteRevision)
        .where(eq(schema.siteRevision.id, result.effect.revisionId!));
      expect(rev.meta).toMatchObject({
        source: "theme-switch",
        fromThemeId: "rose",
        toThemeId: "flux",
      });
      const data = rev.data as any;
      expect(data.themeId).toBe("flux");
      expect(data.pages.map((p: any) => p.id)).toContain("p-blog");
      expect(data.pagesData["p-blog"].content.map((b: any) => b.type)).toEqual([
        "Header",
        "Page",
        "Footer",
      ]);
      expect(result.effect.report!.normalized).toEqual([
        { pageId: "p-blog", from: "legacy" },
      ]);
    });
  });

  describe("старые cron и строки саги", () => {
    function reaperWith(touched: string[], on: Db) {
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
        on,
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

    const siteRow = async (on: Db, id: string) =>
      (await on.select().from(schema.site).where(eq(schema.site.id, id)))[0];

    it("reaper довыполняет старый магазин и не трогает магазин в саге", async () => {
      await inRolledBackTx(async (tx) => {
        await insertSite(
          {
            id: own("old-orphan"),
            tenantId: own("old-tenant"),
            lifecycle: null,
          },
          tx,
        );
        await insertSite(
          {
            id: own("saga-orphan"),
            tenantId: own("saga-tenant"),
            lifecycle: "seeded",
            lifecycleAttempts: 0,
          },
          tx,
        );
        const touched: string[] = [];

        await reaperWith(touched, tx).migrateOrphanedSites();

        expect(touched.filter((t) => t.startsWith(P))).toEqual([
          own("old-tenant"),
        ]);
        expect(await siteRow(tx, own("old-orphan"))).toMatchObject({
          domainId: `dom-${own("old-tenant")}`,
          coolifyAppUuid: "central-proxy",
        });
        expect(await siteRow(tx, own("saga-orphan"))).toMatchObject({
          domainId: null,
          publicUrl: null,
          coolifyAppUuid: null,
          lifecycle: "seeded",
        });
      });
    });

    it("clearMockCache не обнуляет проект у магазина в саге", async () => {
      await inRolledBackTx(async (tx) => {
        await insertSite(
          {
            id: own("old-mock"),
            lifecycle: null,
            coolifyProjectUuid: "mock-project-1",
          },
          tx,
        );
        await insertSite(
          {
            id: own("saga-mock"),
            lifecycle: "ready",
            coolifyProjectUuid: "mock-project-2",
          },
          tx,
        );

        await reaperWith([], tx).clearMockCache();

        expect(
          (await siteRow(tx, own("old-mock"))).coolifyProjectUuid,
        ).toBeNull();
        expect((await siteRow(tx, own("saga-mock"))).coolifyProjectUuid).toBe(
          "mock-project-2",
        );
      });
    });
  });
});

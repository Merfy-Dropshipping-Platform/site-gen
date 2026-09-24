/**
 * Реестр магазинов в памяти для тестов команды `CreateStore` (этап 3, кусок 3.2).
 * Строки — общие с `InMemoryLifecycleRepository` (см. in-memory-lifecycle.ts).
 */
import type {
  NewStoreRow,
  StoreRegistry,
  StoreRegistryTx,
} from "../../store-registry";
import {
  InMemoryLifecycleRepository,
  makeSiteRow,
} from "./in-memory-lifecycle";

/**
 * Реестр магазинов в памяти для команды `CreateStore`: те же строки, что у
 * `InMemoryLifecycleRepository`, плюс блокировка тенанта. Блокировка —
 * настоящая очередь промисов: вторая команда того же тенанта ждёт, пока первая
 * не «закоммитит» (как `pg_advisory_xact_lock` в `DrizzleStoreRegistry`).
 * Между чтениями и записью внутри `work` есть `await` — без блокировки две
 * команды честно прочитали бы одно и то же число магазинов.
 */
export class InMemoryStoreRegistry implements StoreRegistry {
  private readonly tails = new Map<string, Promise<unknown>>();
  readonly inserted: NewStoreRow[] = [];
  lockAcquisitions = 0;

  constructor(private readonly repo: InMemoryLifecycleRepository) {}

  async withTenantLock<T>(
    tenantId: string,
    work: (tx: StoreRegistryTx) => Promise<T>,
  ): Promise<T> {
    const previous = this.tails.get(tenantId) ?? Promise.resolve();
    const run = previous
      .catch(() => undefined)
      .then(() => {
        this.lockAcquisitions += 1;
        return work(this.tx());
      });
    this.tails.set(tenantId, run);
    return run;
  }

  private tx(): StoreRegistryTx {
    const tick = () => new Promise<void>((r) => setImmediate(r));
    const sites = () => [...this.repo.rows.values()];
    return {
      countStores: async (tenantId, scope) => {
        await tick();
        return sites().filter(
          (s) =>
            s.tenantId === tenantId &&
            s.deletedAt === null &&
            (scope === "any" || s.status !== "archived"),
        ).length;
      },
      slugTaken: async (tenantId, slug) => {
        await tick();
        return sites().some(
          (s) =>
            s.tenantId === tenantId &&
            (s.slug ?? "").toLowerCase() === slug.toLowerCase(),
        );
      },
      insertStore: async (row) => {
        await tick();
        this.inserted.push(row);
        this.repo.put(
          makeSiteRow({
            id: row.id,
            tenantId: row.tenantId,
            name: row.name,
            slug: row.slug,
            themeId: row.themeId,
            createdBy: row.actorUserId,
            lifecycle: "reserved",
            lifecycleAttempts: 0,
            lifecycleNextAt: new Date(this.repo.clock.nowMs + row.leaseMs),
            createdAt: new Date(this.repo.clock.nowMs),
          }),
        );
      },
    };
  }
}

// Jest считает тестовым любой .ts в __tests__/** — см. in-memory-lifecycle.ts.
function isOwnTestFile(): boolean {
  try {
    const testPath = (
      globalThis as { expect?: { getState?: () => { testPath?: string } } }
    ).expect?.getState?.().testPath;
    return testPath === __filename;
  } catch {
    return false;
  }
}

if (isOwnTestFile())
  describe("in-memory-registry: блокировка тенанта", () => {
    it("вторая работа того же тенанта начинается после первой", async () => {
      const registry = new InMemoryStoreRegistry(
        new InMemoryLifecycleRepository(),
      );
      const order: string[] = [];
      await Promise.all([
        registry.withTenantLock("t1", async (tx) => {
          order.push("a:start");
          await tx.countStores("t1", "any");
          order.push("a:end");
        }),
        registry.withTenantLock("t1", async () => {
          order.push("b:start");
        }),
      ]);
      expect(order).toEqual(["a:start", "a:end", "b:start"]);
    });
  });

/**
 * Память вместо Postgres для тестов доводчика и команд (этап 3).
 *
 * Семантика захвата повторяет условный UPDATE из `DrizzleLifecycleRepository`:
 * проверка «строка рождается командой, не готова, не удалена, время пришло» и
 * запись аренды идут БЕЗ `await` между ними — в однопоточном JS это атомарно,
 * как блокировка строки в Postgres. Тот же набор правил на настоящей базе
 * проверяет `src/store/__tests__/store.pg.spec.ts`.
 *
 * Время — управляемые часы `FakeClock`, а не `Date.now()`: тест двигает время
 * сам и проверяет паузы повторов точно.
 */
import type { LifecycleRecord } from "../../lifecycle/store-lifecycle";
import type {
  LifecycleRepository,
  LifecycleRow,
} from "../../lifecycle/lifecycle.repository";

export class FakeClock {
  constructor(public nowMs = Date.UTC(2026, 8, 24, 12, 0, 0)) {}
  now(): Date {
    return new Date(this.nowMs);
  }
  advance(ms: number): void {
    this.nowMs += ms;
  }
}

export type StoredSite = LifecycleRow & {
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt?: Date;
  themeAppliedAt?: Date | null;
};

export function makeSiteRow(
  partial: Partial<StoredSite> & { id: string },
): StoredSite {
  return {
    tenantId: "t1",
    name: "Магазин",
    themeId: "rose",
    createdBy: "u1",
    publicUrl: null,
    storageSlug: null,
    currentRevisionId: null,
    domainId: null,
    coolifyProjectUuid: null,
    coolifyAppUuid: null,
    contentModel: "document",
    lifecycle: "reserved",
    lifecycleError: null,
    lifecycleAttempts: 0,
    lifecycleNextAt: null,
    deletedAt: null,
    createdAt: new Date(0),
    slug: null,
    status: "draft",
    ...partial,
  };
}

export class InMemoryLifecycleRepository implements LifecycleRepository {
  readonly rows = new Map<string, StoredSite>();
  readonly records: Array<{ siteId: string; record: LifecycleRecord }> = [];

  constructor(readonly clock: FakeClock = new FakeClock()) {}

  put(row: StoredSite): StoredSite {
    this.rows.set(row.id, row);
    return row;
  }

  private isInFlight(row: StoredSite): boolean {
    return (
      row.lifecycle !== null &&
      row.lifecycle !== "ready" &&
      row.deletedAt === null
    );
  }

  private isDue(row: StoredSite): boolean {
    return (
      row.lifecycleNextAt === null ||
      row.lifecycleNextAt.getTime() <= this.clock.nowMs
    );
  }

  async claim(siteId: string, leaseMs: number): Promise<LifecycleRow | null> {
    const row = this.rows.get(siteId);
    if (!row || !this.isInFlight(row) || !this.isDue(row)) return null;
    row.lifecycleNextAt = new Date(this.clock.nowMs + leaseMs);
    return { ...row };
  }

  async read(siteId: string): Promise<LifecycleRow | null> {
    const row = this.rows.get(siteId);
    return row ? { ...row } : null;
  }

  async readOwned(
    tenantId: string,
    siteId: string,
  ): Promise<LifecycleRow | null> {
    const row = this.rows.get(siteId);
    const owned = row && row.tenantId === tenantId && row.deletedAt === null;
    return owned ? { ...row } : null;
  }

  async record(siteId: string, record: LifecycleRecord): Promise<void> {
    this.records.push({ siteId, record });
    const row = this.rows.get(siteId);
    if (!row) return;
    row.lifecycle = record.state;
    row.lifecycleError = record.error;
    row.lifecycleAttempts = record.attempts;
    row.lifecycleNextAt = nextAtOf(
      record.nextAt,
      row.lifecycleNextAt,
      this.clock,
    );
  }

  async listDue(limit: number): Promise<string[]> {
    return [...this.rows.values()]
      .filter((row) => this.isInFlight(row) && this.isDue(row))
      .sort(
        (a, b) =>
          (a.lifecycleNextAt?.getTime() ?? -1) -
          (b.lifecycleNextAt?.getTime() ?? -1),
      )
      .slice(0, limit)
      .map((row) => row.id);
  }
}

function nextAtOf(
  policy: LifecycleRecord["nextAt"],
  current: Date | null,
  clock: FakeClock,
): Date | null {
  if (policy === "clear") return null;
  if (policy === "keep") return current;
  return new Date(clock.nowMs + policy.inMs);
}

/** Обещание, которое тест разрешает сам, — чтобы держать шаг «в полёте». */
export function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ---------------------------------------------------------------------------
// Jest считает тестовым ЛЮБОЙ .ts внутри __tests__/** — этот файл тоже. Без
// хотя бы одного it() прогон падал бы с «must contain at least one test»;
// гвард isOwnTestFile() не даёт describe() зарегистрироваться второй раз в
// файлах, которые этот модуль импортируют (приём из
// src/content/__tests__/store-content.conformance.ts).
// ---------------------------------------------------------------------------
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
  describe("in-memory-lifecycle: захват как условный UPDATE", () => {
    it("две попытки захвата одной строки — выигрывает одна", async () => {
      const repo = new InMemoryLifecycleRepository();
      repo.put(makeSiteRow({ id: "s1" }));
      const [a, b] = await Promise.all([
        repo.claim("s1", 1000),
        repo.claim("s1", 1000),
      ]);
      expect([a, b].filter(Boolean)).toHaveLength(1);
    });

    it("readOwned: только строка этого тенанта и не удалённая", async () => {
      const repo = new InMemoryLifecycleRepository();
      repo.put(makeSiteRow({ id: "s1", tenantId: "t1" }));
      repo.put(
        makeSiteRow({ id: "gone", tenantId: "t1", deletedAt: new Date(0) }),
      );
      expect((await repo.readOwned("t1", "s1"))?.id).toBe("s1");
      expect(await repo.readOwned("other", "s1")).toBeNull();
      expect(await repo.readOwned("t1", "gone")).toBeNull();
    });

    it("строку без состояния (старый магазин) не захватывает", async () => {
      const repo = new InMemoryLifecycleRepository();
      repo.put(makeSiteRow({ id: "old", lifecycle: null }));
      expect(await repo.claim("old", 1000)).toBeNull();
      expect(await repo.listDue(10)).toEqual([]);
    });
  });

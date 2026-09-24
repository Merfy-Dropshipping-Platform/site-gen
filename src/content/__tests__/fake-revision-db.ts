/**
 * Фейковая БД ревизий для тестов записи (этап 2): `site_revision` + указатель
 * `site.current_revision_id`, CAS как в Postgres, транзакция с откатом.
 *
 * Покрывает ровно те вызовы, что делают `DocumentAdapter`, `SitesDomainService`
 * (createRevision/setCurrentRevision/listRevisions/resetContentPages) и
 * `PagesService`. Условия `where` разбираются через `PgDialect().sqlToQuery` —
 * тем же приёмом, что `document.adapter.spec.ts` и `revision-create-cas.spec.ts`.
 *
 * Для гонок: `hooks.beforeCas` вызывается перед проверкой CAS — туда тест кладёт
 * «чужую запись, пришедшую в ту же миллисекунду». `inPlaceUpdates` копит каждую
 * правку строки ревизии на месте — нарушение И1 видно в тесте.
 *
 * Файл лежит в `__tests__`, поэтому jest считает его набором; собственная
 * проверка регистрируется только при прогоне ЭТОГО файла (тот же приём, что в
 * `store-content.conformance.ts`).
 */
import { PgDialect } from "drizzle-orm/pg-core";
import * as schema from "../../db/schema";

const dialect = new PgDialect();

export interface FakeRevision {
  id: string;
  siteId: string;
  data: unknown;
  meta: Record<string, unknown>;
  createdAt: Date;
  createdBy?: string | null;
}

export interface FakeSite {
  id: string;
  tenantId: string;
  currentRevisionId: string | null;
  themeId: string | null;
  publicUrl: string | null;
  name: string;
  contentModel: string;
  updatedAt?: Date;
}

type Query = { sql: string; params: unknown[] };

function queryOf(cond: unknown): Query {
  return dialect.sqlToQuery(cond as never);
}

/** Результат select: промис строк с `.limit(n)`, как у drizzle. */
function rowsResult<T>(rows: T[]) {
  const result: any = Promise.resolve(rows);
  result.limit = (n: number) => Promise.resolve(rows.slice(0, n));
  return result;
}

export function makeFakeRevisionDb(
  initialSite: Partial<FakeSite> & { id: string; tenantId: string },
) {
  const site: FakeSite = {
    currentRevisionId: null,
    themeId: "rose",
    publicUrl: null,
    name: "Витрина",
    contentModel: "document",
    ...initialSite,
  };
  const revisions = new Map<string, FakeRevision>();
  const inPlaceUpdates: Array<{ id: unknown; data: unknown }> = [];
  const hooks: { beforeCas?: () => void } = {};
  let clock = 0;

  /**
   * Как настоящая БД (jsonb сериализуется): наружу — копии строк. Иначе тест,
   * меняющий свой документ после записи, правил бы «сохранённую» ревизию.
   */
  function selectRevisions(cond: unknown): FakeRevision[] {
    return findRevisions(cond).map((row) => structuredClone(row));
  }

  function findRevisions(cond: unknown): FakeRevision[] {
    const { sql, params } = queryOf(cond);
    if (sql.includes('"site_revision"."id" =')) {
      const row = revisions.get(params[0] as string);
      const siteMatches =
        !sql.includes('"site_revision"."site_id"') || row?.siteId === params[1];
      return row && siteMatches ? [row] : [];
    }
    const hideSnapshots = params.includes("client-snapshot");
    return [...revisions.values()]
      .filter((r) => r.siteId === params[0])
      .filter((r) => !hideSnapshots || r.meta?.kind !== "client-snapshot");
  }

  function selectSites(cond: unknown): FakeSite[] {
    const { sql, params } = queryOf(cond);
    const idMatches = params[0] === site.id;
    const tenantMatches =
      !sql.includes('"site"."tenant_id"') || params[1] === site.tenantId;
    return idMatches && tenantMatches ? [{ ...site }] : [];
  }

  /**
   * `applyPatch` — вне транзакции применяет сразу, внутри — откладывает до
   * фиксации (откат транзакции не должен трогать чужие записи из «другого
   * соединения», сделанные крючком `beforeCas`).
   */
  function updateSite(
    cond: unknown,
    patch: Partial<FakeSite>,
    applyPatch: (p: Partial<FakeSite>) => void,
  ) {
    const { sql, params } = queryOf(cond);
    const isCasEq = sql.includes('"site"."current_revision_id" =');
    const isCasNull = sql.includes('"site"."current_revision_id" is null');
    const ownsSite =
      params[0] === site.id &&
      (!sql.includes('"site"."tenant_id"') || params[1] === site.tenantId);
    if (!isCasEq && !isCasNull) {
      if (ownsSite) applyPatch(patch);
      return rowsResult([]);
    }
    const hook = hooks.beforeCas;
    hooks.beforeCas = undefined;
    hook?.();
    const expected = isCasNull ? null : params[params.length - 1];
    const matches = ownsSite && site.currentRevisionId === expected;
    const rows = matches ? [{ id: site.id }] : [];
    const result: any = Promise.resolve(rows);
    result.returning = async () => {
      if (matches) applyPatch(patch);
      return rows;
    };
    return result;
  }

  const applyNow = (patch: Partial<FakeSite>) => Object.assign(site, patch);

  function insertRevision(
    target: Map<string, FakeRevision> | FakeRevision[],
    value: any,
  ) {
    clock += 1;
    const row: FakeRevision = {
      ...structuredClone(value),
      meta: structuredClone(value.meta ?? {}),
      createdAt: new Date(Date.UTC(2026, 8, 24, 0, 0, clock)),
    };
    if (Array.isArray(target)) target.push(row);
    else target.set(row.id, row);
  }

  function makeUpdate(
    table: unknown,
    applyPatch: (p: Partial<FakeSite>) => void = applyNow,
  ) {
    return {
      set: (patch: any) => ({
        where: (cond: unknown) => {
          if (table === schema.site) return updateSite(cond, patch, applyPatch);
          const { params } = queryOf(cond);
          inPlaceUpdates.push({ id: params[0], data: patch.data });
          const row = revisions.get(params[0] as string);
          if (row) Object.assign(row, structuredClone(patch));
          return rowsResult([]);
        },
      }),
    };
  }

  function makeSelect() {
    return {
      from: (table: unknown) => ({
        where: (cond: unknown) =>
          rowsResult<unknown>(
            table === schema.site ? selectSites(cond) : selectRevisions(cond),
          ),
      }),
    };
  }

  const db: any = {
    select: () => makeSelect(),
    insert: (table: unknown) => ({
      values: async (value: any) => {
        if (table === schema.siteRevision) insertRevision(revisions, value);
      },
    }),
    update: (table: unknown) => makeUpdate(table),
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const staged: FakeRevision[] = [];
      const stagedPatches: Array<Partial<FakeSite>> = [];
      const tx = {
        select: () => makeSelect(),
        insert: (table: unknown) => ({
          values: async (value: any) => {
            if (table === schema.siteRevision) insertRevision(staged, value);
          },
        }),
        update: (table: unknown) =>
          makeUpdate(table, (p) => stagedPatches.push(p)),
      };
      const out = await callback(tx);
      staged.forEach((row) => revisions.set(row.id, row));
      stagedPatches.forEach(applyNow);
      return out;
    },
  };

  return {
    db,
    site,
    revisions,
    inPlaceUpdates,
    hooks,
    /** Положить ревизию напрямую (стартовое состояние магазина). */
    seedRevision(
      id: string,
      data: unknown,
      opts: { current?: boolean; meta?: Record<string, unknown> } = {},
    ) {
      insertRevision(revisions, {
        id,
        siteId: site.id,
        data,
        meta: opts.meta ?? {},
      });
      if (opts.current ?? true) site.currentRevisionId = id;
    },
    storedData(id: string): any {
      return revisions.get(id)?.data;
    },
    storedMeta(id: string): any {
      return revisions.get(id)?.meta;
    },
    currentData(): any {
      return site.currentRevisionId
        ? revisions.get(site.currentRevisionId)?.data
        : undefined;
    },
  };
}

export type FakeRevisionDb = ReturnType<typeof makeFakeRevisionDb>;

function isOwnTestFile(): boolean {
  try {
    return (globalThis as any).expect?.getState?.().testPath === __filename;
  } catch {
    return false;
  }
}

if (isOwnTestFile())
  describe("fake-revision-db: сама фейковая БД", () => {
    it("CAS проходит только от текущей ревизии, неудачная транзакция откатывает вставку", async () => {
      const fake = makeFakeRevisionDb({ id: "site-1", tenantId: "t-1" });
      fake.seedRevision("r0", { a: 1 });
      const { and, eq } = await import("drizzle-orm");
      const cas = (expected: string) =>
        fake.db.transaction(async (tx: any) => {
          await tx
            .insert(schema.siteRevision)
            .values({ id: `r-${expected}`, siteId: "site-1", data: {} });
          const rows = await tx
            .update(schema.site)
            .set({ currentRevisionId: `r-${expected}` })
            .where(
              and(
                eq(schema.site.id, "site-1"),
                eq(schema.site.tenantId, "t-1"),
                eq(schema.site.currentRevisionId, expected),
              ),
            )
            .returning({ id: schema.site.id });
          if (rows.length === 0) throw new Error("revision_conflict");
        });
      await expect(cas("nope")).rejects.toThrow("revision_conflict");
      expect(fake.revisions.has("r-nope")).toBe(false);
      await cas("r0");
      expect(fake.site.currentRevisionId).toBe("r-r0");
    });
  });

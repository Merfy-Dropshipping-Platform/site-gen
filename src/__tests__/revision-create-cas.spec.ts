import { PgDialect } from "drizzle-orm/pg-core";
import { SitesMicroserviceController } from "../sites.microservice.controller";
import { SitesDomainService } from "../sites.service";
import { RevisionConflictError } from "../content/store-content.port";

function createDb(currentRevisionId: string | null, updateMatches: boolean) {
  const committedRevisionIds: string[] = [];
  const predicates: unknown[] = [];

  const tx = {
    insert: jest.fn(() => ({
      values: jest.fn(async (value: { id: string }) => value.id),
    })),
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn((predicate: unknown) => {
          predicates.push(predicate);
          return {
            returning: jest.fn(async () =>
              updateMatches ? [{ id: "site-1" }] : [],
            ),
          };
        }),
      })),
    })),
  };

  const db = {
    insert: jest.fn(() => ({
      values: jest.fn(async (value: { id: string }) => {
        committedRevisionIds.push(value.id);
      }),
    })),
    update: tx.update,
    transaction: jest.fn(
      async (callback: (value: typeof tx) => Promise<void>) => {
        const staged: string[] = [];
        tx.insert.mockImplementation(
          () =>
            ({
              values: jest.fn(async (value: { id: string }) => {
                staged.push(value.id);
              }),
            }) as never,
        );
        await callback(tx);
        committedRevisionIds.push(...staged);
      },
    ),
  };

  return { db, tx, predicates, committedRevisionIds, currentRevisionId };
}

function makeService(db: unknown) {
  const dependency = {} as never;
  return new SitesDomainService(
    db as never,
    dependency,
    dependency,
    dependency,
    dependency,
    dependency,
    dependency,
    dependency,
    dependency,
  );
}

describe("SitesDomainService.createRevision CAS", () => {
  it("atomically creates and activates a revision when expected current matches", async () => {
    const fixture = createDb("rev-a", true);
    const service = makeService(fixture.db);
    jest.spyOn(service, "get").mockResolvedValue({
      id: "site-1",
      tenantId: "tenant-1",
      currentRevisionId: "rev-a",
    } as never);

    const result = await service.createRevision({
      tenantId: "tenant-1",
      siteId: "site-1",
      data: {},
      setCurrent: true,
      expectedCurrentRevisionId: "rev-a",
    });

    expect(result.revisionId).toEqual(expect.any(String));
    expect(fixture.committedRevisionIds).toEqual([result.revisionId]);
    const query = new PgDialect().sqlToQuery(fixture.predicates[0] as never);
    expect(query.sql).toContain('"site"."current_revision_id" =');
    expect(query.params).toEqual(
      expect.arrayContaining(["site-1", "tenant-1", "rev-a"]),
    );
  });

  it("rolls back the inserted revision when expected current is stale", async () => {
    const fixture = createDb("rev-b", false);
    const service = makeService(fixture.db);
    jest.spyOn(service, "get").mockResolvedValue({ id: "site-1" } as never);

    await expect(
      service.createRevision({
        tenantId: "tenant-1",
        siteId: "site-1",
        data: {},
        setCurrent: true,
        expectedCurrentRevisionId: "rev-a",
      }),
    ).rejects.toThrow("revision_conflict");

    expect(fixture.committedRevisionIds).toEqual([]);
  });

  it("atomically creates and activates a revision when no current revision is expected", async () => {
    const fixture = createDb(null, true);
    const service = makeService(fixture.db);
    jest.spyOn(service, "get").mockResolvedValue({
      id: "site-1",
      tenantId: "tenant-1",
      currentRevisionId: null,
    } as never);

    const result = await service.createRevision({
      tenantId: "tenant-1",
      siteId: "site-1",
      data: {},
      setCurrent: true,
      expectedCurrentRevisionId: null,
    });

    expect(fixture.committedRevisionIds).toEqual([result.revisionId]);
    const query = new PgDialect().sqlToQuery(fixture.predicates[0] as never);
    expect(query.sql).toContain('"site"."current_revision_id" is null');
    expect(query.params).toEqual(
      expect.arrayContaining(["site-1", "tenant-1"]),
    );
  });

  it("rolls back the inserted revision when an expected null current is stale", async () => {
    const fixture = createDb("rev-b", false);
    const service = makeService(fixture.db);
    jest.spyOn(service, "get").mockResolvedValue({ id: "site-1" } as never);

    await expect(
      service.createRevision({
        tenantId: "tenant-1",
        siteId: "site-1",
        data: {},
        setCurrent: true,
        expectedCurrentRevisionId: null,
      }),
    ).rejects.toThrow("revision_conflict");

    expect(fixture.committedRevisionIds).toEqual([]);
  });

  // R2 (`merfy-mcp/docs/plans/2026-09-30-revisions-clean.md`): было — «без
  // expectedCurrentRevisionId» шло ДВУМЯ отдельными вызовами db.insert/
  // db.update мимо транзакции («второй путь записи» рядом с CAS-веткой).
  // Стало — единственная функция фиксации (DocumentAdapter.commit): вставка
  // ревизии и (безусловный, без CAS-предиката) сдвиг указателя одной
  // транзакцией, тем же кодом, что и CAS-ветка выше. Данные на выходе те же
  // (И7 путём одного писателя) — поменялся только SQL-конвейер под капотом.
  it("uses the same transactional commit when expected current is omitted", async () => {
    const fixture = createDb("rev-a", true);
    const service = makeService(fixture.db);
    jest.spyOn(service, "get").mockResolvedValue({ id: "site-1" } as never);

    const result = await service.createRevision({
      tenantId: "tenant-1",
      siteId: "site-1",
      data: {},
      setCurrent: true,
    });

    expect(fixture.db.transaction).toHaveBeenCalledTimes(1);
    expect(fixture.committedRevisionIds).toEqual([result.revisionId]);
  });
});

describe("SitesMicroserviceController.createRevision CAS", () => {
  // Этап 2 «Безопасная запись» идёт ПОД ФЛАГОМ: шлюз ставит `mergeOnStale:
  // true` только аккаунтам из списка NEW_LOGIC_EMAILS.
  //   без флага — как до этапа 2: expectedCurrentRevisionId уходит в жёсткий
  //     CAS домена, устаревшая база → revision_conflict → 409;
  //   с флагом — тот же id становится БАЗОЙ записи, устаревшая база сливается
  //     (побеждает последний), жёсткий CAS этим путём не зовётся.
  function makeController() {
    const domain = {
      createRevision: jest.fn().mockResolvedValue({ revisionId: "rev-new" }),
    };
    const controller = new SitesMicroserviceController(
      domain as unknown as SitesDomainService,
    );
    return { domain, controller };
  }

  it.each([
    ["revision id", "rev-a"],
    ["null", null],
  ])(
    "без mergeOnStale: expected current %s уходит в жёсткий CAS, базы слияния нет",
    async (_label, expectedCurrentRevisionId) => {
      const { domain, controller } = makeController();

      await controller.createRevision({
        tenantId: "tenant-1",
        siteId: "site-1",
        data: {},
        setCurrent: true,
        expectedCurrentRevisionId,
      });

      const params = domain.createRevision.mock.calls[0][0];
      expect(params).toMatchObject({
        setCurrent: true,
        expectedCurrentRevisionId,
        actor: "merchant",
        source: "constructor",
      });
      expect(params).not.toHaveProperty("base");
      expect(params).not.toHaveProperty("mergePolicy");
    },
  );

  it.each([false, "true", 1, undefined])(
    "mergeOnStale = %p (не строго true) — старый путь",
    async (mergeOnStale) => {
      const { domain, controller } = makeController();

      await controller.createRevision({
        tenantId: "tenant-1",
        siteId: "site-1",
        data: {},
        setCurrent: true,
        expectedCurrentRevisionId: "rev-a",
        mergeOnStale,
      });

      expect(domain.createRevision.mock.calls[0][0]).toMatchObject({
        expectedCurrentRevisionId: "rev-a",
      });
      expect(domain.createRevision.mock.calls[0][0]).not.toHaveProperty(
        "base",
      );
    },
  );

  it.each([
    ["revision id", "rev-a"],
    ["null", null],
  ])(
    "mergeOnStale: true — expected current %s становится базой слияния",
    async (_label, expectedCurrentRevisionId) => {
      const { domain, controller } = makeController();

      await controller.createRevision({
        tenantId: "tenant-1",
        siteId: "site-1",
        data: {},
        setCurrent: true,
        expectedCurrentRevisionId,
        mergeOnStale: true,
      });

      expect(domain.createRevision).toHaveBeenCalledWith(
        expect.objectContaining({
          base: expectedCurrentRevisionId,
          mergePolicy: "last-writer-wins",
          actor: "merchant",
          source: "constructor",
        }),
      );
      expect(domain.createRevision.mock.calls[0][0]).not.toHaveProperty(
        "expectedCurrentRevisionId",
      );
    },
  );

  it("returns a stable conflict envelope", async () => {
    const domain = {
      createRevision: jest
        .fn()
        .mockRejectedValue(new RevisionConflictError()),
    };
    const controller = new SitesMicroserviceController(
      domain as unknown as SitesDomainService,
    );

    await expect(
      controller.createRevision({
        tenantId: "tenant-1",
        siteId: "site-1",
        data: {},
      }),
    ).resolves.toEqual({
      success: false,
      code: "REVISION_CONFLICT",
      message: "revision_conflict",
    });
  });
});

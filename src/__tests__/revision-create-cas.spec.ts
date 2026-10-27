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
  // Контроллер только передаёт домену id, который видел клиент, и флаг шлюза
  // (`mergeOnStale: true` — аккаунты из NEW_LOGIC_EMAILS). Слияние или жёсткий
  // CAS выбирает домен по теме магазина — см. describe ниже.
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
    "без mergeOnStale: expected current %s и флаг false уходят домену",
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
        constructorBase: {
          seen: expectedCurrentRevisionId,
          mergeOnStale: false,
        },
        actor: "merchant",
        source: "constructor",
      });
      expect(params).not.toHaveProperty("base");
      expect(params).not.toHaveProperty("mergePolicy");
      expect(params).not.toHaveProperty("expectedCurrentRevisionId");
    },
  );

  it.each([false, "true", 1, undefined])(
    "mergeOnStale = %p (не строго true) — флаг домену false",
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
        constructorBase: { seen: "rev-a", mergeOnStale: false },
      });
    },
  );

  it("mergeOnStale: true — флаг домену true", async () => {
    const { domain, controller } = makeController();

    await controller.createRevision({
      tenantId: "tenant-1",
      siteId: "site-1",
      data: {},
      setCurrent: true,
      expectedCurrentRevisionId: "rev-a",
      mergeOnStale: true,
    });

    expect(domain.createRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        constructorBase: { seen: "rev-a", mergeOnStale: true },
        actor: "merchant",
        source: "constructor",
      }),
    );
  });

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

describe("SitesDomainService.createRevision: сведение выбирает sites по теме", () => {
  // nova — всегда слияние, без флага шлюза; остальные темы — слияние только
  // при `mergeOnStale: true`, иначе жёсткий CAS (REVISION_CONFLICT → 409).
  async function writeAs(themeId: string, mergeOnStale: boolean) {
    const service = makeService(createDb("rev-a", true).db);
    jest.spyOn(service, "get").mockResolvedValue({
      id: "site-1",
      tenantId: "tenant-1",
      themeId,
      currentRevisionId: "rev-a",
    } as never);
    const store = jest
      .spyOn((service as any).storeContent, "createRevision")
      .mockResolvedValue({ revisionId: "rev-new" } as never);
    await service.createRevision({
      tenantId: "tenant-1",
      siteId: "site-1",
      data: {},
      constructorBase: { seen: "rev-a", mergeOnStale },
    });
    return store.mock.calls[0][1] as Record<string, unknown>;
  }

  it("nova без флага — слияние от базы", async () => {
    const params = await writeAs("nova", false);
    expect(params).toMatchObject({
      base: "rev-a",
      mergePolicy: "last-writer-wins",
    });
    expect(params).not.toHaveProperty("expectedCurrentRevisionId");
    expect(params).not.toHaveProperty("constructorBase");
  });

  it("старая тема без флага — жёсткий CAS", async () => {
    const params = await writeAs("rose", false);
    expect(params).toMatchObject({ expectedCurrentRevisionId: "rev-a" });
    expect(params).not.toHaveProperty("base");
    expect(params).not.toHaveProperty("mergePolicy");
  });

  it("старая тема с флагом — слияние от базы", async () => {
    const params = await writeAs("rose", true);
    expect(params).toMatchObject({
      base: "rev-a",
      mergePolicy: "last-writer-wins",
    });
    expect(params).not.toHaveProperty("expectedCurrentRevisionId");
  });
});

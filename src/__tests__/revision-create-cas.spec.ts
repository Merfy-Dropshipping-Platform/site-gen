import { PgDialect } from "drizzle-orm/pg-core";
import { SitesMicroserviceController } from "../sites.microservice.controller";
import { SitesDomainService } from "../sites.service";

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

  it("keeps the legacy non-transactional path when expected current is omitted", async () => {
    const fixture = createDb("rev-a", true);
    const service = makeService(fixture.db);
    jest.spyOn(service, "get").mockResolvedValue({ id: "site-1" } as never);

    const result = await service.createRevision({
      tenantId: "tenant-1",
      siteId: "site-1",
      data: {},
      setCurrent: true,
    });

    expect(fixture.db.transaction).not.toHaveBeenCalled();
    expect(fixture.committedRevisionIds).toEqual([result.revisionId]);
  });
});

describe("SitesMicroserviceController.createRevision CAS", () => {
  it.each([
    ["revision id", "rev-a"],
    ["null", null],
  ])(
    "forwards an expected current %s",
    async (_label, expectedCurrentRevisionId) => {
      const domain = {
        createRevision: jest.fn().mockResolvedValue({ revisionId: "rev-new" }),
      };
      const controller = new SitesMicroserviceController(
        domain as unknown as SitesDomainService,
      );

      await controller.createRevision({
        tenantId: "tenant-1",
        siteId: "site-1",
        data: {},
        setCurrent: true,
        expectedCurrentRevisionId,
      });

      expect(domain.createRevision).toHaveBeenCalledWith(
        expect.objectContaining({ expectedCurrentRevisionId }),
      );
    },
  );

  it("returns a stable conflict envelope", async () => {
    const domain = {
      createRevision: jest
        .fn()
        .mockRejectedValue(new Error("revision_conflict")),
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

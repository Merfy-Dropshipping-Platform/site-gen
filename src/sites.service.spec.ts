import { SitesDomainService } from "./sites.service";
import * as schema from "./db/schema";

class MockEvents {
  public events: Array<{ pattern: string; payload: any }> = [];
  emit(pattern: string, payload: any) {
    this.events.push({ pattern, payload });
  }
}

class MockGenerator {
  async build(_: any) {
    return {
      buildId: "b1",
      revisionId: "r1",
      artifactUrl: "file:///tmp/a.zip",
    };
  }
}

class MockDeployments {
  async deploy(_: any) {
    return { deploymentId: "d1", url: "https://site.preview.local" };
  }
}

class MockCoolify {
  async setDomain(_: string, __: string) {
    return { success: true } as const;
  }
  async toggleMaintenance(_: string, __: boolean) {
    return { success: true } as const;
  }
}

class MockStorage {
  async isEnabled() {
    return false;
  }
  getSitePrefixBySubdomain(_subdomain: string) {
    return "sites/test/";
  }
  async checkSiteFiles(_prefix: string) {
    return { exists: true, hasIndex: true, fileCount: 1, totalSize: 100, files: [] };
  }
}

class MockCoolifyClient {
  send(_pattern: string, _data: any) {
    return {
      pipe: () => ({
        subscribe: (observer: any) => {
          observer.next({ success: true });
          observer.complete?.();
          return { unsubscribe: () => {} };
        },
      }),
    };
  }
}

class MockDomainClient {
  async verifyDomain(_domain: string) {
    return { verified: true };
  }
}

class MockBillingClient {
  async checkQuota(_tenantId: string) {
    return { allowed: true };
  }
}

type TableAny = any;

function makeSelectBuilder(rows: any[]) {
  return {
    from: (_: TableAny) => ({
      where: (_w: any) => ({
        limit: (_l: number) => Promise.resolve(rows),
      }),
    }),
  } as any;
}

describe("SitesDomainService (unit)", () => {
  it("publish orchestrates build, deploy and emits published event", async () => {
    // Arrange DB mock: get(site) -> existing row
    const db: any = {
      select: () => ({
        from: (tbl: TableAny) => ({
          where: (_w: any) => {
            if (tbl === schema.site)
              return Promise.resolve([{ id: "s1", tenantId: "t1" }]);
            if (tbl === schema.siteRevision)
              return Promise.resolve([{ data: {}, meta: {} }]);
            return Promise.resolve([]);
          },
        }),
      }),
      insert: () => ({ values: async (_: any) => [] }),
      update: () => ({
        set: (_: any) => ({ where: async (_w: any) => [] }),
        where: (_: any) => ({
          returning: (_r: any) => Promise.resolve([{ id: "s1" }]),
        }),
      }),
      delete: () => ({
        where: (_: any) => ({
          returning: (_r: any) => Promise.resolve([{ id: "s1" }]),
        }),
      }),
    };

    const events = new MockEvents();
    const service = new SitesDomainService(
      db,
      new MockCoolifyClient() as any,
      new MockGenerator() as any,
      events as any,
      new MockDeployments() as any,
      new MockStorage() as any,
      new MockDomainClient() as any,
      new MockBillingClient() as any,
    );

    // Act
    const res = await service.publish({
      tenantId: "t1",
      siteId: "s1",
      mode: "draft",
    });

    // Assert
    expect(res.url).toBe("https://site.preview.local");
    expect(
      events.events.some((e) => e.pattern === "sites.site.published"),
    ).toBe(true);
  });

  it("attachDomain maps unique violation to domain_already_in_use", async () => {
    const db: any = {
      select: () => ({
        from: (tbl: TableAny) => ({
          where: (_: any) => Promise.resolve([{ id: "s1" }]),
        }),
      }),
      insert: (_tbl: any) => ({
        values: async (_: any) => {
          throw new Error(
            'duplicate key value violates unique constraint "site_domain_unique"',
          );
        },
      }),
      update: () => ({ set: (_: any) => ({ where: async (_: any) => [] }) }),
      delete: () => ({
        where: (_: any) => ({
          returning: (_: any) => Promise.resolve([{ id: "s1" }]),
        }),
      }),
    };
    const service = new SitesDomainService(
      db,
      new MockCoolifyClient() as any,
      new MockGenerator() as any,
      new MockEvents() as any,
      new MockDeployments() as any,
      new MockStorage() as any,
      new MockDomainClient() as any,
      new MockBillingClient() as any,
    );
    await expect(
      service.attachDomain({
        tenantId: "t1",
        siteId: "s1",
        domain: "example.com",
        actorUserId: "u1",
      }),
    ).rejects.toThrow("domain_already_in_use");
  });

  it("verifyDomain throws on token mismatch", async () => {
    const db: any = {
      select: () => ({
        from: (tbl: TableAny) => ({
          where: (_: any) => {
            if (tbl === schema.site) return Promise.resolve([{ id: "s1" }]);
            if (tbl === schema.siteDomain)
              return Promise.resolve([{ id: "d1", token: "token123" }]);
            return Promise.resolve([]);
          },
        }),
      }),
      update: () => ({
        set: (_: any) => ({
          where: (_: any) => ({
            returning: (_: any) => Promise.resolve([{ id: "d1" }]),
          }),
        }),
      }),
      insert: () => ({ values: async (_: any) => [] }),
      delete: () => ({
        where: (_: any) => ({
          returning: (_: any) => Promise.resolve([{ id: "s1" }]),
        }),
      }),
    };
    const service = new SitesDomainService(
      db,
      new MockCoolifyClient() as any,
      new MockGenerator() as any,
      new MockEvents() as any,
      new MockDeployments() as any,
      new MockStorage() as any,
      new MockDomainClient() as any,
      new MockBillingClient() as any,
    );
    await expect(
      service.verifyDomain({
        tenantId: "t1",
        siteId: "s1",
        domain: "example.com",
        token: "wrong",
      }),
    ).rejects.toThrow("verification_token_mismatch");
  });
});

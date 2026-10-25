/**
 * Фикс 25.10: все магазины одной организации получают разные поддомены витрины.
 *
 * Раньше finishProvisioning звал domainClient.generateSubdomain(tenantId) —
 * поддомен детерминирован от организации, и 2-й/3-й магазин получали тот же
 * public_url / storage_slug / domain_id, что первый. Теперь sites передаёт
 * вместе с tenantId и siteId, а domain-сервис выдаёт каждому магазину свой
 * поддомен.
 */
import { SitesDomainService } from "../sites.service";
import * as schema from "../db/schema";

const TENANT = "aaaaaabb-bbcc-4ddd-8ddd-eeeeeeeeeeee";
const SITE_1 = "11111111-2222-4333-8444-555555555555";
const SITE_2 = "66666666-7777-4888-8999-000000000000";

function thenableRows(rows: any[]) {
  const p: any = Promise.resolve(rows);
  p.limit = (n: number) => Promise.resolve(rows.slice(0, n));
  return p;
}

/**
 * Один магазин в «базе» заглушки: select отдаёт строку, условный update —
 * меняет (упрощение makeProvisioningService из provisioning-saga-bridge.spec).
 */
function makeSiteService(opts: { siteId: string }) {
  const row = {
    domainId: null as string | null,
    publicUrl: null as string | null,
    storageSlug: null as string | null,
    coolifyProjectUuid: null as string | null,
  };
  const writes: Array<{ set: any }> = [];
  const history: any[] = [];
  const db: any = {
    select: () => ({
      from: (tbl: unknown) => ({
        where: () => {
          if (tbl !== schema.site) return thenableRows([]);
          return thenableRows([{ ...row }]);
        },
      }),
    }),
    update: () => ({
      set: (set: any) => ({
        where: () => {
          writes.push({ set });
          Object.assign(row, set);
          const p: any = Promise.resolve([]);
          p.returning = async () => [{ id: opts.siteId }];
          return p;
        },
      }),
    }),
    insert: (tbl: unknown) => ({
      values: async (v: any) => {
        if (tbl === schema.siteDomainHistory) history.push(v);
      },
    }),
  };
  // domain-сервис: поддомен зависит от id магазина (фикс 25.10).
  const domainClient = {
    generateSubdomain: jest.fn(async (tenantId: string, siteId: string) => ({
      id: `dom-${siteId}`,
      name: `${siteId.replace(/-/g, "").slice(0, 12)}.merfy.ru`,
    })),
  };
  const storage = {
    getSitePublicUrlBySubdomain: (s: string) => `https://${s}`,
    extractSubdomainSlug: (u: string) =>
      u.replace(/^https?:\/\//, "").split(".")[0],
  };
  const dep = {} as any;
  const service = new SitesDomainService(
    db,
    dep,
    dep,
    { emit: jest.fn() } as any,
    dep,
    storage as any,
    domainClient as any,
    dep,
    dep,
  );
  jest
    .spyOn(service, "getOrCreateTenantProject")
    .mockResolvedValue("proj-1" as any);
  return { service, writes, row, domainClient, history };
}

describe("finishProvisioning: каждому магазину организации — свой поддомен", () => {
  it("два магазина одной организации дают разные public_url и storage_slug", async () => {
    const first = makeSiteService({ siteId: SITE_1 });
    const second = makeSiteService({ siteId: SITE_2 });

    const r1 = await first.service.finishProvisioning(SITE_1, TENANT, "Org");
    const r2 = await second.service.finishProvisioning(SITE_2, TENANT, "Org");

    expect(r1.publicUrl).toBeTruthy();
    expect(r2.publicUrl).toBeTruthy();
    expect(r1.publicUrl).not.toBe(r2.publicUrl);
    expect(first.row.publicUrl).not.toBe(second.row.publicUrl);
    expect(first.row.storageSlug).not.toBe(second.row.storageSlug);
    expect(first.row.storageSlug).toMatch(/^[0-9a-f]{12}$/);
    expect(second.row.storageSlug).toMatch(/^[0-9a-f]{12}$/);
    expect(first.row.domainId).not.toBe(second.row.domainId);
  });

  it("domain-сервис получает siteId вместе с tenantId", async () => {
    const first = makeSiteService({ siteId: SITE_1 });

    await first.service.finishProvisioning(SITE_1, TENANT, "Org");

    expect(first.domainClient.generateSubdomain).toHaveBeenCalledWith(
      TENANT,
      SITE_1,
    );
  });

  it("повторный провижининг того же магазина — тот же поддомен (идемпотентность)", async () => {
    const first = makeSiteService({ siteId: SITE_1 });

    const before = await first.service.finishProvisioning(
      SITE_1,
      TENANT,
      "Org",
    );
    // После успешного провижининга повтор — no-op (domainId и проект на месте).
    const again = await first.service.finishProvisioning(SITE_1, TENANT, "Org");

    expect(again.publicUrl).toBe(before.publicUrl);
    expect(first.domainClient.generateSubdomain).toHaveBeenCalledTimes(1);
  });
});

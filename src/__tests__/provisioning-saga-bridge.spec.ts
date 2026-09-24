/**
 * Мост между старым провижинингом и сагой рождения (этап 3, кусок 3.1).
 *
 * 1. Характеризация шага «маршрут хостинга» в reaper (`migrateOrphanedSites`):
 *    роутер центрального прокси или per-site app Coolify. Этот код выносится в
 *    общий `ensureSiteHosting`, которым пользуется и шаг `route` саги, — тесты
 *    держат поведение reaper неизменным после выноса.
 * 2. Старые cron не трогают строки саги: reaper и `clearMockCache` берут только
 *    `lifecycle IS NULL` (решение плана И7: «доводчик — только непустые, старые
 *    cron — только пустые»).
 * 3. `finishProvisioning` сообщает, ЧТО не получилось (домен REG.RU / проект
 *    Coolify), — раньше это уходило только в лог, а сага кладёт причину в
 *    `lifecycle_error`.
 * 4. `ensureSiteHosting(siteId)` — шаг `route` саги: идемпотентен, не
 *    перетирает app, записанный параллельной публикацией.
 */
import { PgDialect } from "drizzle-orm/pg-core";
import { SitesDomainService } from "../sites.service";
import * as schema from "../db/schema";
import { CENTRAL_PROXY_APP_SENTINEL } from "../constants";

const dialect = new PgDialect();
const render = (cond: unknown) => dialect.sqlToQuery(cond as any).sql;

function thenableRows(rows: any[]) {
  const p: any = Promise.resolve(rows);
  p.limit = (n: number) => Promise.resolve(rows.slice(0, n));
  return p;
}

type Orphan = {
  id: string;
  tenantId: string;
  name: string;
  publicUrl: string | null;
  storageSlug: string | null;
  coolifyProjectUuid: string | null;
  coolifyAppUuid: string | null;
};

function makeReaperService(opts: {
  orphans: Orphan[];
  centralProxy: boolean;
  routerFails?: boolean;
  coolifyResult?: any;
}) {
  const siteUpdates: Array<{ set: any; where: string }> = [];
  const whereClauses: string[] = [];
  let siteSelects = 0;
  const db: any = {
    delete: () => ({ where: async () => [] }),
    update: (tbl: unknown) => ({
      set: (set: any) => ({
        where: async (cond: unknown) => {
          if (tbl === schema.site)
            siteUpdates.push({ set, where: render(cond) });
          return [];
        },
      }),
    }),
    select: () => ({
      from: (tbl: unknown) => ({
        where: (cond: unknown) => {
          if (tbl !== schema.site) return thenableRows([]);
          siteSelects += 1;
          if (siteSelects === 1) {
            whereClauses.push(render(cond));
            return thenableRows(opts.orphans);
          }
          return thenableRows([{ coolifyAppUuid: null }]);
        },
      }),
    }),
  };
  const coolifyClient = {
    send: jest.fn(() => ({
      pipe: () => ({
        subscribe: (o: any) => {
          o.next(opts.coolifyResult ?? { success: true, appUuid: "app-123" });
          o.complete?.();
          return { unsubscribe() {} };
        },
      }),
    })),
  };
  const deployments = {
    centralProxyEnabled: opts.centralProxy,
    ensureCentralRouter: jest.fn(async () => {
      if (opts.routerFails) throw new Error("traefik dir not writable");
      return "https://shop.merfy.ru";
    }),
  };
  const storage = {
    getSitePublicUrlBySubdomain: (s: string) => `https://${s}`,
    extractSubdomainSlug: (u: string) =>
      u.replace(/^https?:\/\//, "").split(".")[0],
  };
  const dep = {} as any;
  const service = new SitesDomainService(
    db,
    coolifyClient as any,
    dep,
    dep,
    deployments as any,
    storage as any,
    dep,
    dep,
    dep,
  );
  jest
    .spyOn(service, "getOrCreateTenantProject")
    .mockResolvedValue("proj-1" as any);
  return { service, siteUpdates, whereClauses, deployments, coolifyClient };
}

const provisioned: Orphan = {
  id: "s1",
  tenantId: "t1",
  name: "Shop",
  publicUrl: "https://abc.merfy.ru",
  storageSlug: "abc",
  coolifyProjectUuid: "proj-1",
  coolifyAppUuid: null,
};

describe("reaper (migrateOrphanedSites): маршрут хостинга — поведение как было", () => {
  it("центральный прокси: роутер по storageSlug, app = sentinel", async () => {
    const { service, siteUpdates, deployments } = makeReaperService({
      orphans: [provisioned],
      centralProxy: true,
    });

    const result = await service.migrateOrphanedSites();

    expect(result).toMatchObject({ migrated: 1, failed: 0 });
    expect(deployments.ensureCentralRouter).toHaveBeenCalledWith("abc");
    expect(siteUpdates.at(-1)!.set).toMatchObject({
      coolifyAppUuid: CENTRAL_PROXY_APP_SENTINEL,
    });
  });

  it("без центрального прокси: static site app в проекте тенанта", async () => {
    const { service, siteUpdates, coolifyClient } = makeReaperService({
      orphans: [provisioned],
      centralProxy: false,
    });

    await service.migrateOrphanedSites();

    expect(coolifyClient.send).toHaveBeenCalledWith(
      "coolify.create_static_site_app",
      {
        projectUuid: "proj-1",
        name: "site-abc",
        subdomain: "abc.merfy.ru",
        sitePath: "sites/abc",
      },
    );
    expect(siteUpdates.at(-1)!.set).toMatchObject({
      coolifyAppUuid: "app-123",
    });
  });

  it("роутер не записался — строка обновляется без app (reaper повторит), сайт не «упал»", async () => {
    const { service, siteUpdates } = makeReaperService({
      orphans: [provisioned],
      centralProxy: true,
      routerFails: true,
    });

    const result = await service.migrateOrphanedSites();

    expect(result).toMatchObject({ migrated: 1, failed: 0 });
    expect("coolifyAppUuid" in siteUpdates.at(-1)!.set).toBe(false);
  });

  it("Coolify не создал app — строка обновляется без app", async () => {
    const { service, siteUpdates } = makeReaperService({
      orphans: [provisioned],
      centralProxy: false,
      coolifyResult: { success: false, message: "quota" },
    });

    await service.migrateOrphanedSites();

    expect("coolifyAppUuid" in siteUpdates.at(-1)!.set).toBe(false);
  });
});

describe("старые cron не трогают строки саги (И7)", () => {
  it("reaper выбирает только строки без состояния рождения", async () => {
    const { service, whereClauses } = makeReaperService({
      orphans: [],
      centralProxy: true,
    });
    await service.migrateOrphanedSites();
    expect(whereClauses[0]).toMatch(/"site"\."lifecycle" is null/i);
  });

  it("clearMockCache сбрасывает mock-проект только у строк без состояния рождения", async () => {
    const { service, siteUpdates } = makeReaperService({
      orphans: [],
      centralProxy: true,
    });
    await service.clearMockCache();
    expect(siteUpdates).toHaveLength(1);
    expect(siteUpdates[0].where).toMatch(/"site"\."lifecycle" is null/i);
  });
});

describe("finishProvisioning: что именно не получилось — в ответе", () => {
  /** Строка сайта в «базе» заглушки: select её отдаёт, условный update — меняет. */
  const EMPTY_SITE = {
    domainId: null as string | null,
    publicUrl: null as string | null,
    storageSlug: null as string | null,
    coolifyProjectUuid: null as string | null,
  };

  function makeProvisioningService(opts: {
    domainFails?: boolean;
    projectFails?: boolean;
    /** Кто-то другой уже записал эти поля между нашим чтением и записью. */
    writtenMeanwhile?: Partial<typeof EMPTY_SITE>;
  }) {
    const row = { ...EMPTY_SITE };
    let reads = 0;
    const writes: Array<{ set: any; where: string }> = [];
    const history: any[] = [];
    const db: any = {
      select: () => ({
        from: (tbl: unknown) => ({
          where: () => {
            if (tbl !== schema.site) return thenableRows([]);
            reads += 1;
            // Первое чтение — до гонки; дальше конкурент уже записал своё.
            if (reads === 2) Object.assign(row, opts.writtenMeanwhile ?? {});
            return thenableRows([{ ...row }]);
          },
        }),
      }),
      update: () => ({
        set: (set: any) => ({
          where: (cond: unknown) => {
            const where = render(cond);
            writes.push({ set, where });
            const guard = /"domain_id" is null/i.test(where)
              ? "domainId"
              : "coolifyProjectUuid";
            if (reads === 1) Object.assign(row, opts.writtenMeanwhile ?? {});
            const free = row[guard as keyof typeof row] === null;
            if (free) Object.assign(row, set);
            const p: any = Promise.resolve([]);
            p.returning = async () => (free ? [{ id: "s1" }] : []);
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
    const domainClient = {
      generateSubdomain: jest.fn(async () => {
        if (opts.domainFails) throw new Error("REG.RU timeout");
        return { id: "dom-1", name: "abc.merfy.ru" };
      }),
    };
    const storage = {
      getSitePublicUrlBySubdomain: (s: string) => `https://${s}`,
      extractSubdomainSlug: () => "abc",
    };
    const events = { emit: jest.fn() };
    const dep = {} as any;
    const service = new SitesDomainService(
      db,
      dep,
      dep,
      events as any,
      dep,
      storage as any,
      domainClient as any,
      dep,
      dep,
    );
    jest
      .spyOn(service, "getOrCreateTenantProject")
      .mockImplementation(async () => {
        if (opts.projectFails) throw new Error("coolify_project_create_failed");
        return "proj-1";
      });
    const warn = jest.spyOn((service as any).logger, "warn");
    return Object.assign(service, {
      probe: { writes, history, row, events, warn },
    });
  }

  it("всё получилось — провалов нет", async () => {
    const result = await makeProvisioningService({}).finishProvisioning(
      "s1",
      "t1",
      "Org",
    );
    expect(result).toEqual({ publicUrl: "https://abc.merfy.ru", failures: {} });
  });

  it("REG.RU упал — failures.domain с причиной; проект при этом создан", async () => {
    const result = await makeProvisioningService({
      domainFails: true,
    }).finishProvisioning("s1", "t1", "Org");
    expect(result.failures).toEqual({ domain: "REG.RU timeout" });
  });

  it("М1: домен и проект пишутся условно — только если их ещё никто не записал", async () => {
    const service = makeProvisioningService({});

    await service.finishProvisioning("s1", "t1", "Org");

    expect(service.probe.writes.map((w) => Object.keys(w.set).sort())).toEqual([
      ["domainId", "publicUrl", "storageSlug", "updatedAt"],
      ["coolifyProjectUuid", "updatedAt"],
    ]);
    expect(service.probe.writes[0].where).toMatch(
      /"site"\."domain_id" is null/i,
    );
    expect(service.probe.writes[1].where).toMatch(
      /"site"\."coolify_project_uuid" is null/i,
    );
  });

  it("М1: опоздал с доменом — свой не пишет, в лог — кто проиграл, наружу — домен победителя", async () => {
    const service = makeProvisioningService({
      writtenMeanwhile: {
        domainId: "dom-winner",
        publicUrl: "https://winner.merfy.ru",
        storageSlug: "winner",
      },
    });

    const result = await service.finishProvisioning("s1", "t1", "Org");

    expect(service.probe.row).toMatchObject({
      domainId: "dom-winner",
      publicUrl: "https://winner.merfy.ru",
      coolifyProjectUuid: "proj-1",
    });
    expect(result.publicUrl).toBe("https://winner.merfy.ru");
    expect(service.probe.warn).toHaveBeenCalledWith(
      expect.stringMatching(/s1.*проиграл.*domain.*dom-1/),
    );
    // Историю домена пишет победитель — второй не дублирует.
    expect(service.probe.history).toEqual([]);
    expect(service.probe.events.emit).toHaveBeenCalledWith(
      "sites.site.provisioned",
      expect.objectContaining({ domainId: "dom-winner" }),
    );
  });

  it("Coolify упал — failures.project с причиной", async () => {
    const result = await makeProvisioningService({
      projectFails: true,
    }).finishProvisioning("s1", "t1", "Org");
    expect(result.failures).toEqual({
      project: "coolify_project_create_failed",
    });
  });
});

describe("ensureSiteHosting(siteId): шаг route саги", () => {
  function makeHostingService(
    row: Partial<Orphan> | null,
    opts: { centralProxy: boolean; routerFails?: boolean },
  ) {
    const writes: Array<{ set: any; where: string }> = [];
    const db: any = {
      select: () => ({
        from: () => ({ where: () => thenableRows(row ? [row] : []) }),
      }),
      update: () => ({
        set: (set: any) => ({
          where: (cond: unknown) => {
            writes.push({ set, where: render(cond) });
            const p: any = Promise.resolve([]);
            p.returning = async () => [{ id: "s1" }];
            return p;
          },
        }),
      }),
    };
    const deployments = {
      centralProxyEnabled: opts.centralProxy,
      ensureCentralRouter: jest.fn(async () => {
        if (opts.routerFails) throw new Error("traefik dir not writable");
        return "https://abc.merfy.ru";
      }),
    };
    const storage = {
      extractSubdomainSlug: (u: string) =>
        u.replace(/^https?:\/\//, "").split(".")[0],
    };
    const dep = {} as any;
    const service = new SitesDomainService(
      db,
      dep,
      dep,
      dep,
      deployments as any,
      storage as any,
      dep,
      dep,
      dep,
    );
    return { service, writes, deployments };
  }

  it("ставит роутер и пишет sentinel только если app ещё не записан (не перетирает публикацию)", async () => {
    const { service, writes } = makeHostingService(
      { ...provisioned },
      { centralProxy: true },
    );

    const result = await service.ensureSiteHosting("s1");

    expect(result).toEqual({ coolifyAppUuid: CENTRAL_PROXY_APP_SENTINEL });
    expect(writes).toHaveLength(1);
    expect(writes[0].set).toMatchObject({
      coolifyAppUuid: CENTRAL_PROXY_APP_SENTINEL,
    });
    expect(writes[0].where).toMatch(/"site"\."coolify_app_uuid" is null/i);
  });

  it("app уже есть — ничего не делает", async () => {
    const { service, writes, deployments } = makeHostingService(
      { ...provisioned, coolifyAppUuid: "app-9" },
      { centralProxy: true },
    );
    expect(await service.ensureSiteHosting("s1")).toEqual({
      coolifyAppUuid: "app-9",
    });
    expect(writes).toHaveLength(0);
    expect(deployments.ensureCentralRouter).not.toHaveBeenCalled();
  });

  it("роутер не записался — причина в ответе, строка не тронута", async () => {
    const { service, writes } = makeHostingService(
      { ...provisioned },
      { centralProxy: true, routerFails: true },
    );
    expect(await service.ensureSiteHosting("s1")).toEqual({
      coolifyAppUuid: null,
      error: "traefik dir not writable",
    });
    expect(writes).toHaveLength(0);
  });

  it("нет слага хранилища (провижининг не закончен) — причина в ответе", async () => {
    const { service } = makeHostingService(
      { ...provisioned, publicUrl: null, storageSlug: null },
      { centralProxy: true },
    );
    expect(await service.ensureSiteHosting("s1")).toEqual({
      coolifyAppUuid: null,
      error: "no storage slug yet",
    });
  });

  it("магазина нет — причина в ответе", async () => {
    const { service } = makeHostingService(null, { centralProxy: true });
    expect(await service.ensureSiteHosting("s1")).toEqual({
      coolifyAppUuid: null,
      error: "site_not_found",
    });
  });
});

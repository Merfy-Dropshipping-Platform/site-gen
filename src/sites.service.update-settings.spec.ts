import { SitesDomainService } from "./sites.service";

/**
 * Юнит-тесты shallow-merge семантики settings в SitesDomainService.update.
 *
 * Паттерн повторяет sites.service.spec.ts: ручной db-мок, без реального
 * Postgres. update() для settings-only патча выполняет ровно два db-обращения:
 *   1) initial select (themeId/status/settings) — снимок сайта ДО апдейта;
 *   2) update().set(updates).where().returning() — сама запись.
 * Мок захватывает объект, переданный в .set(), чтобы проверить, что именно
 * записывается в колонку settings.
 */
function makeDb(existingRow: any) {
  const captured: { updates?: any } = {};
  const db: any = {
    select: () => ({
      from: (_tbl: any) => ({
        where: (_w: any) => ({
          limit: (_l: number) =>
            Promise.resolve(existingRow ? [existingRow] : []),
        }),
      }),
    }),
    update: () => ({
      set: (u: any) => {
        captured.updates = u;
        return {
          where: (_w: any) => ({
            returning: (_r: any) => Promise.resolve([{ id: "s1" }]),
          }),
        };
      },
    }),
  };
  return { db, captured };
}

function makeService(db: any) {
  const events = { emit: () => {} };
  return new SitesDomainService(
    db,
    {} as any, // coolifyClient
    {} as any, // generator
    events as any, // events
    {} as any, // deployments
    {} as any, // storage
    {} as any, // domainClient
    {} as any, // billingClient
    { queueBuild: () => Promise.resolve(true) } as any, // buildQueue
  );
}

describe("SitesDomainService.update — settings shallow-merge", () => {
  it("частичный settings-патч мёржится, не затирая существующие ключи", async () => {
    const { db, captured } = makeDb({
      themeId: null,
      status: "draft",
      settings: { requireCustomerAuth: true },
    });
    const service = makeService(db);

    const ok = await service.update({
      tenantId: "t1",
      siteId: "s1",
      patch: { settings: { addressRequired: false } },
    });

    expect(ok).toBe(true);
    // requireCustomerAuth сохранён, addressRequired добавлен
    expect(captured.updates.settings).toEqual({
      requireCustomerAuth: true,
      addressRequired: false,
    });
  });

  it("частичный settings-патч поверх нескольких ключей мёржит, а не заменяет", async () => {
    const { db, captured } = makeDb({
      themeId: null,
      status: "draft",
      settings: { requireCustomerAuth: true, contactMethod: "email-phone" },
    });
    const service = makeService(db);

    await service.update({
      tenantId: "t1",
      siteId: "s1",
      patch: { settings: { customerNameMode: "name-surname" } },
    });

    expect(captured.updates.settings).toEqual({
      requireCustomerAuth: true,
      contactMethod: "email-phone",
      customerNameMode: "name-surname",
    });
  });

  it("settings === null очищает настройки в null", async () => {
    const { db, captured } = makeDb({
      themeId: null,
      status: "draft",
      settings: { requireCustomerAuth: true },
    });
    const service = makeService(db);

    await service.update({
      tenantId: "t1",
      siteId: "s1",
      patch: { settings: null },
    });

    expect(captured.updates.settings).toBeNull();
  });

  it("патч без ключа settings не трогает колонку settings", async () => {
    const { db, captured } = makeDb({
      themeId: null,
      status: "draft",
      settings: { requireCustomerAuth: true },
    });
    const service = makeService(db);

    await service.update({
      tenantId: "t1",
      siteId: "s1",
      patch: { name: "New name" },
    });

    expect("settings" in captured.updates).toBe(false);
    expect(captured.updates.name).toBe("New name");
  });

  it("частичный settings-патч при отсутствующих settings стартует с пустого объекта", async () => {
    const { db, captured } = makeDb({
      themeId: null,
      status: "draft",
      settings: null,
    });
    const service = makeService(db);

    await service.update({
      tenantId: "t1",
      siteId: "s1",
      patch: { settings: { addressRequired: true } },
    });

    expect(captured.updates.settings).toEqual({ addressRequired: true });
  });
});

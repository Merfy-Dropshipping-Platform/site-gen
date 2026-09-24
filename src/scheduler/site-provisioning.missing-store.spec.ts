/**
 * Cron «пользователи без магазина» зовёт команду `CreateStore` (этап 3, кусок
 * 3.2): та же команда, что регистрация и кабинет; лимит и «у тенанта уже есть
 * магазин» решает она, один раз. Cron сам биллинг и список магазинов больше
 * не спрашивает.
 */
jest.mock("minio", () => ({
  Client: jest.fn().mockImplementation(() => ({})),
}));

import { from } from "rxjs";
import {
  MISSING_STORE_NAME,
  SiteProvisioningScheduler,
} from "./site-provisioning.scheduler";
import { makeCreateStoreHarness } from "../store/__tests__/support/create-store-harness";
import { makeSiteRow } from "../store/__tests__/support/in-memory-lifecycle";

/**
 * Асинхронный ответ, как у настоящего RMQ-клиента: `rpc()` планировщика
 * отписывается в `complete` и на синхронном `of()` падал бы на TDZ.
 */
function userClientListing(
  users: Array<{ userId: string; tenantId: string; accountId: string }>,
) {
  return {
    send: jest.fn(() => from(Promise.resolve({ success: true, users }))),
  };
}

describe("provisionMissingSites → CreateStore", () => {
  const previous = process.env.SITE_PROVISIONING_CRON_ENABLED;
  beforeEach(() => delete process.env.SITE_PROVISIONING_CRON_ENABLED);
  afterEach(() => {
    if (previous === undefined)
      delete process.env.SITE_PROVISIONING_CRON_ENABLED;
    else process.env.SITE_PROVISIONING_CRON_ENABLED = previous;
  });

  it("на каждого пользователя без магазина — CreateStore('Мой магазин', ifNoStores, missing-store)", async () => {
    const createStore = {
      execute: jest
        .fn()
        .mockResolvedValue({ ok: true, effect: { created: true } }),
    };
    const users = [
      { userId: "u1", tenantId: "t1", accountId: "a1" },
      { userId: "u2", tenantId: "t2", accountId: "a2" },
    ];
    const sites = { list: jest.fn(), create: jest.fn() };
    const scheduler = new SiteProvisioningScheduler(
      userClientListing(users) as any,
      sites as any,
      createStore,
    );

    await scheduler.provisionMissingSites();

    expect(createStore.execute.mock.calls.map(([input]) => input)).toEqual([
      {
        tenantId: "t1",
        actorUserId: "u1",
        name: MISSING_STORE_NAME,
        ifNoStores: true,
        wait: false,
        source: "missing-store",
      },
      {
        tenantId: "t2",
        actorUserId: "u2",
        name: MISSING_STORE_NAME,
        ifNoStores: true,
        wait: false,
        source: "missing-store",
      },
    ]);
    // Старый путь (список магазинов + create() со своим лимитом) не используется.
    expect(sites.list).not.toHaveBeenCalled();
    expect(sites.create).not.toHaveBeenCalled();
  });

  it("отказ или исключение у одного пользователя не останавливает остальных", async () => {
    const createStore = {
      execute: jest
        .fn()
        .mockRejectedValueOnce(new Error("db down"))
        .mockResolvedValueOnce({
          ok: false,
          error: { code: "billing_unavailable" },
        })
        .mockResolvedValueOnce({ ok: true, effect: { created: true } }),
    };
    const users = ["u1", "u2", "u3"].map((u, i) => ({
      userId: u,
      tenantId: `t${i}`,
      accountId: u,
    }));
    const scheduler = new SiteProvisioningScheduler(
      userClientListing(users) as any,
      {} as any,
      createStore,
    );

    await scheduler.provisionMissingSites();

    expect(createStore.execute).toHaveBeenCalledTimes(3);
  });

  it("через настоящую команду: у тенанта уже есть магазин — второго нет; нет магазина — создан «Мой магазин»", async () => {
    const { command, repo, registry } = makeCreateStoreHarness();
    repo.put(
      makeSiteRow({ id: "existing", tenantId: "t-has", lifecycle: null }),
    );
    const users = [
      { userId: "u1", tenantId: "t-has", accountId: "a1" },
      { userId: "u2", tenantId: "t-new", accountId: "a2" },
    ];
    const scheduler = new SiteProvisioningScheduler(
      userClientListing(users) as any,
      {} as any,
      command,
    );

    await scheduler.provisionMissingSites();
    await command.settle();

    expect(registry.inserted.map((r) => [r.tenantId, r.name])).toEqual([
      ["t-new", MISSING_STORE_NAME],
    ]);
    expect(repo.rows.get(registry.inserted[0].id)!.lifecycle).toBe("ready");
  });
});

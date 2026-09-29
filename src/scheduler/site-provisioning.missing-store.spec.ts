/**
 * Cron «пользователи без магазина» остаётся на старом пути ДЛЯ ВСЕХ.
 *
 * Новая логика этапа 3 (команда `CreateStore`) включается флагом, который
 * ставит шлюз по почте аккаунта (NEW_LOGIC_EMAILS). У cron почты нет, поэтому
 * он работает как до этапа 3: сам спрашивает список магазинов и биллинг, затем
 * `sites.create({ name: 'Мой магазин' })`.
 */
jest.mock("minio", () => ({
  Client: jest.fn().mockImplementation(() => ({})),
}));

import { from } from "rxjs";
import { SiteProvisioningScheduler } from "./site-provisioning.scheduler";

/**
 * Асинхронный ответ, как у настоящего RMQ-клиента: `rpc()` планировщика
 * отписывается в `complete` и на синхронном `of()` падал бы на TDZ.
 */
function rmqAnswering(answer: (pattern: string, data: any) => unknown) {
  return {
    send: jest.fn((pattern: string, data: any) =>
      from(Promise.resolve(answer(pattern, data))),
    ),
  };
}

const ACTIVE = {
  success: true,
  shopsLimit: 3,
  frozen: false,
  storefrontSuspended: false,
  status: "active",
};

function makeScheduler(opts: {
  users: Array<{ userId: string; tenantId: string; accountId: string }>;
  sitesOf?: Record<string, number>;
  entitlements?: unknown;
}) {
  const billing = rmqAnswering(() => opts.entitlements ?? ACTIVE);
  const userClient = rmqAnswering(() => ({ success: true, users: opts.users }));
  const sites = {
    list: jest.fn(async (tenantId: string) => ({
      items: Array.from({ length: opts.sitesOf?.[tenantId] ?? 0 }, (_, i) => ({
        id: `${tenantId}-site-${i}`,
      })),
    })),
    create: jest.fn(async (p: { tenantId: string }) => ({
      id: `new-${p.tenantId}`,
    })),
  };
  const scheduler = new SiteProvisioningScheduler(
    billing as any,
    userClient as any,
    sites as any,
  );
  return { scheduler, sites, billing };
}

describe("provisionMissingSites — старый путь для всех (у cron нет почты, флага нет)", () => {
  const previous = process.env.SITE_PROVISIONING_CRON_ENABLED;
  beforeEach(() => delete process.env.SITE_PROVISIONING_CRON_ENABLED);
  afterEach(() => {
    if (previous === undefined)
      delete process.env.SITE_PROVISIONING_CRON_ENABLED;
    else process.env.SITE_PROVISIONING_CRON_ENABLED = previous;
  });

  it("пользователю без магазина — sites.create('Мой магазин') после проверки биллинга", async () => {
    const { scheduler, sites, billing } = makeScheduler({
      users: [
        { userId: "u1", tenantId: "t1", accountId: "a1" },
        { userId: "u2", tenantId: "t2", accountId: "a2" },
      ],
    });

    await scheduler.provisionMissingSites();

    expect(sites.create.mock.calls.map(([p]) => p)).toEqual([
      { tenantId: "t1", actorUserId: "u1", name: "Мой магазин" },
      { tenantId: "t2", actorUserId: "u2", name: "Мой магазин" },
    ]);
    expect(billing.send).toHaveBeenCalledWith("billing.get_entitlements", {
      accountId: "a1",
    });
  });

  it("у тенанта уже есть магазин — второго нет", async () => {
    const { scheduler, sites } = makeScheduler({
      users: [
        { userId: "u1", tenantId: "t-has", accountId: "a1" },
        { userId: "u2", tenantId: "t-new", accountId: "a2" },
      ],
      sitesOf: { "t-has": 1 },
    });

    await scheduler.provisionMissingSites();

    expect(sites.create.mock.calls.map(([p]) => p.tenantId)).toEqual(["t-new"]);
  });

  it("биллинг не ответил по существу — магазин не создаётся", async () => {
    const { scheduler, sites } = makeScheduler({
      users: [{ userId: "u1", tenantId: "t1", accountId: "a1" }],
      entitlements: { success: false },
    });

    await scheduler.provisionMissingSites();

    expect(sites.create).not.toHaveBeenCalled();
  });
});

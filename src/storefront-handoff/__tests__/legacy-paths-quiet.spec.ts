/**
 * Прежний конвейер молчит для магазинов новой темы (design.md блока 6,
 * находка 2 от 10.10, решение владельца «7. да»):
 * - ProductUpdateListener — ни заплаток фрагментов, ни таймера сборки через 45 с:
 *   `product.events` слушает сам сборщик (Св-3 А);
 * - ContentSyncScheduler — магазин новой темы не проверяется на `index.html`
 *   старой раскладки и не собирается: его сверяет сборщик (reconcile.ts);
 * - BillingSyncScheduler — то же в `ensureStaticContent()`; сверка заморозки
 *   по организации не меняется.
 * Магазины нынешних тем — всё как было.
 */
import { from } from "rxjs";
import { ProductUpdateListener } from "../../listeners/product-update.listener";
import { ContentSyncScheduler } from "../../scheduler/content-sync.scheduler";
import { BillingSyncScheduler } from "../../scheduler/billing-sync.scheduler";

const ROSE = "site-rose";
const NOVA = "site-nova";
const TENANT = "tenant-1";

const handoff = () => ({
  isNewTheme: jest.fn(async (siteId: string) => siteId === NOVA),
});

function dbWith(rows: Array<Record<string, unknown>>) {
  const chain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(rows),
  };
  return { select: jest.fn().mockReturnValue(chain) } as any;
}

describe("ProductUpdateListener: магазин новой темы — тишина", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function setup(siteId: string) {
    const buildQueue = { queueBuild: jest.fn().mockResolvedValue(true) };
    const patcher = { patchFragments: jest.fn().mockResolvedValue(undefined) };
    const config = { get: jest.fn() } as any;
    const listener = new ProductUpdateListener(
      config,
      dbWith([
        { id: siteId, status: "published", storageSlug: `slug-${siteId}` },
      ]),
      buildQueue as any,
      patcher as any,
      handoff() as any,
    );
    const channel = { ack: jest.fn() };
    const msg = {
      content: Buffer.from(
        JSON.stringify({
          event: "product.updated",
          tenantId: TENANT,
          productIds: ["p1"],
        }),
      ),
    };
    const deliver = () => (listener as any).handleMessage(msg, channel);
    return { listener, buildQueue, patcher, channel, deliver };
  }

  async function settle(ms: number) {
    await jest.advanceTimersByTimeAsync(ms);
  }

  it("нынешняя тема: заплатка сразу, через 45 с — прежняя сборка", async () => {
    const { listener, buildQueue, patcher, channel, deliver } = setup(ROSE);
    await deliver();
    expect(patcher.patchFragments).toHaveBeenCalledWith(
      ROSE,
      TENANT,
      `slug-${ROSE}`,
    );
    await settle(45_000);
    expect(buildQueue.queueBuild).toHaveBeenCalledWith({
      tenantId: TENANT,
      siteId: ROSE,
      mode: "production",
      priority: 5,
      trigger: "product_update",
    });
    expect(channel.ack).toHaveBeenCalledTimes(1);
    await listener.onModuleDestroy();
  });

  it("новая тема: ни заплаток, ни таймера, ни сборки; сообщение подтверждено", async () => {
    const { listener, buildQueue, patcher, channel, deliver } = setup(NOVA);
    await deliver();
    expect((listener as any).fragmentPatchMap.size).toBe(0);
    expect((listener as any).debounceMap.size).toBe(0);
    await settle(60_000);
    expect(patcher.patchFragments).not.toHaveBeenCalled();
    expect(buildQueue.queueBuild).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalledTimes(1);
    await listener.onModuleDestroy();
  });
});

describe("ContentSyncScheduler: магазин новой темы не собирается", () => {
  function setup(siteId: string) {
    const storage = {
      isEnabled: jest.fn().mockResolvedValue(true),
      checkSiteFiles: jest.fn().mockResolvedValue({ hasIndex: false }),
      getSitePrefixBySubdomain: jest.fn(),
    };
    const generator = {
      build: jest.fn().mockResolvedValue({ artifactUrl: "s3://x" }),
    };
    const scheduler = new ContentSyncScheduler(
      dbWith([
        {
          id: siteId,
          tenantId: TENANT,
          publicUrl: "https://shop.merfy.ru",
          storageSlug: "shop",
          status: "published",
        },
      ]),
      storage as any,
      generator as any,
      handoff() as any,
    );
    return { scheduler, generator };
  }

  it("нынешняя тема без index.html — прежняя сборка, как раньше", async () => {
    const { scheduler, generator } = setup(ROSE);
    await scheduler.syncContent();
    expect(generator.build).toHaveBeenCalledWith({
      tenantId: TENANT,
      siteId: ROSE,
      mode: "production",
    });
  });

  it("новая тема — сборки нет", async () => {
    const { scheduler, generator } = setup(NOVA);
    await scheduler.syncContent();
    expect(generator.build).not.toHaveBeenCalled();
  });
});

describe("BillingSyncScheduler: ensureStaticContent молчит для новой темы, заморозка — как раньше", () => {
  function setup(siteId: string) {
    const storage = {
      checkSiteFiles: jest.fn().mockResolvedValue({ hasIndex: false }),
      getSitePrefixBySubdomain: jest.fn(),
    };
    const generator = { build: jest.fn().mockResolvedValue({}) };
    const sites = {
      freezeTenant: jest.fn().mockResolvedValue({ affected: 1 }),
      unfreezeTenant: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    // Ответ брокера приходит не синхронно — как у настоящего ClientProxy.
    const reply = (value: unknown) => from(Promise.resolve(value));
    const userClient = { send: jest.fn(() => reply({ accountId: "acc-1" })) };
    const billingClient = {
      send: jest.fn(() => reply({ success: true, frozen: true })),
    };
    const scheduler = new BillingSyncScheduler(
      dbWith([
        {
          id: siteId,
          tenantId: TENANT,
          publicUrl: "https://shop.merfy.ru",
          storageSlug: "shop",
        },
      ]),
      billingClient as any,
      userClient as any,
      sites as any,
      storage as any,
      generator as any,
      handoff() as any,
    );
    return { scheduler, generator, sites };
  }

  it("нынешняя тема без статики — прежняя сборка, как раньше", async () => {
    const { scheduler, generator } = setup(ROSE);
    await scheduler.reconcileBilling();
    expect(generator.build).toHaveBeenCalledWith({
      tenantId: TENANT,
      siteId: ROSE,
      mode: "production",
    });
  });

  it("новая тема — сборки нет, а заморозка организации идёт как раньше", async () => {
    const { scheduler, generator, sites } = setup(NOVA);
    await scheduler.reconcileBilling();
    expect(sites.freezeTenant).toHaveBeenCalledWith(TENANT);
    expect(generator.build).not.toHaveBeenCalled();
  });
});

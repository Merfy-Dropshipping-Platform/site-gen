/**
 * Тик доводчика (этап 3, кусок 3.1): один cron по состоянию вместо двух.
 * Выключатель — тот же, что у старых cron провижининга.
 */
import {
  StoreLifecycleScheduler,
  LIFECYCLE_TICK_LIMIT,
} from "../store-lifecycle.scheduler";
import { deferred } from "../../__tests__/support/in-memory-lifecycle";

describe("StoreLifecycleScheduler", () => {
  const previous = process.env.SITE_PROVISIONING_CRON_ENABLED;
  afterEach(() => {
    if (previous === undefined)
      delete process.env.SITE_PROVISIONING_CRON_ENABLED;
    else process.env.SITE_PROVISIONING_CRON_ENABLED = previous;
  });

  it("тик двигает созревшие строки доводчиком с лимитом", async () => {
    delete process.env.SITE_PROVISIONING_CRON_ENABLED;
    const reconciler = { tick: jest.fn().mockResolvedValue({ processed: 2 }) };
    await new StoreLifecycleScheduler(reconciler as any).tick();
    expect(reconciler.tick).toHaveBeenCalledWith(LIFECYCLE_TICK_LIMIT);
  });

  it("выключатель SITE_PROVISIONING_CRON_ENABLED=false глушит и доводчик", async () => {
    process.env.SITE_PROVISIONING_CRON_ENABLED = "false";
    const reconciler = { tick: jest.fn() };
    await new StoreLifecycleScheduler(reconciler as any).tick();
    expect(reconciler.tick).not.toHaveBeenCalled();
  });

  it("долгий тик не перекрывается следующим", async () => {
    delete process.env.SITE_PROVISIONING_CRON_ENABLED;
    const gate = deferred<{ processed: number }>();
    const reconciler = { tick: jest.fn(() => gate.promise) };
    const scheduler = new StoreLifecycleScheduler(reconciler as any);

    const first = scheduler.tick();
    await scheduler.tick();
    gate.resolve({ processed: 0 });
    await first;

    expect(reconciler.tick).toHaveBeenCalledTimes(1);
  });

  it("ошибка тика не роняет процесс и не залипает флаг", async () => {
    delete process.env.SITE_PROVISIONING_CRON_ENABLED;
    const reconciler = {
      tick: jest
        .fn()
        .mockRejectedValueOnce(new Error("db down"))
        .mockResolvedValue({ processed: 0 }),
    };
    const scheduler = new StoreLifecycleScheduler(reconciler as any);

    await expect(scheduler.tick()).resolves.toBeUndefined();
    await scheduler.tick();

    expect(reconciler.tick).toHaveBeenCalledTimes(2);
  });
});

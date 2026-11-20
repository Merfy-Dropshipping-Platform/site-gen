import { QUEUE_FULL, createLimiter, waitUpTo } from "../async-utils";
import { deferred } from "./doubles";

describe("waitUpTo", () => {
  it("задача закончилась раньше бюджета — возвращается сразу", async () => {
    const started = Date.now();
    await waitUpTo(Promise.resolve(), 1000);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("бюджет вышел — возвращается, задача идёт дальше", async () => {
    const gate = deferred();
    let finished = false;
    const task = gate.promise.then(() => {
      finished = true;
    });

    await waitUpTo(task, 10);
    expect(finished).toBe(false);

    gate.release();
    await task;
    expect(finished).toBe(true);
  });

  it("ошибка задачи не пробрасывается", async () => {
    await expect(
      waitUpTo(Promise.reject(new Error("boom")), 10),
    ).resolves.toBeUndefined();
  });
});

describe("createLimiter", () => {
  it("не больше заданного числа задач одновременно, порядок сохраняется", async () => {
    const limiter = createLimiter(2, 10);
    const order: number[] = [];
    let active = 0;
    let maxActive = 0;
    const task = (id: number) => async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push(id);
      active -= 1;
    };

    await Promise.all([1, 2, 3, 4, 5].map((id) => limiter.run(task(id))));

    expect(maxActive).toBe(2);
    expect(order).toHaveLength(5);
  });

  it("очередь переполнена — отказ сразу", async () => {
    const limiter = createLimiter(1, 1);
    const gate = deferred();
    const first = limiter.run(() => gate.promise);
    const second = limiter.run(async () => "ok");

    await expect(limiter.run(async () => "late")).rejects.toThrow(QUEUE_FULL);

    gate.release();
    await first;
    await expect(second).resolves.toBe("ok");
  });

  it("упавшая задача освобождает место", async () => {
    const limiter = createLimiter(1, 1);

    await expect(
      limiter.run(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    await expect(limiter.run(async () => "next")).resolves.toBe("next");
  });
});

/**
 * Досев набора оформления у существующих магазинов новой темы (03.11): каждый магазин выборки — PlaceSkeleton со
 * списками оформления; отказ или сбой одного магазина проход не валит.
 */
import { CHECKOUT_LISTS, placeCheckoutSets } from "../checkout-set.job";

const quiet = { log: jest.fn(), warn: jest.fn() };
const effect = (complete: boolean) => ({
  ok: true as const,
  effect: { complete, sections: { skipped: [] } },
});

describe("placeCheckoutSets", () => {
  it("каждый магазин выборки — PlaceSkeleton с lists оформления и его тенантом; сводка по итогам", async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce(effect(true))
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "skeleton_in_progress" },
      })
      .mockRejectedValueOnce(new Error("сборщик недоступен"));
    const shops = jest.fn().mockResolvedValue([
      { id: "s-1", tenant_id: "t-1" },
      { id: "s-2", tenant_id: "t-2" },
      { id: "s-3", tenant_id: "t-3" },
    ]);
    const summary = await placeCheckoutSets(
      { shops, place: { execute } },
      ["nova"],
      () => false,
      quiet,
    );
    expect(shops).toHaveBeenCalledWith(["nova"]);
    expect(execute.mock.calls.map(([input]) => input)).toEqual([
      { tenantId: "t-1", siteId: "s-1", lists: CHECKOUT_LISTS },
      { tenantId: "t-2", siteId: "s-2", lists: CHECKOUT_LISTS },
      { tenantId: "t-3", siteId: "s-3", lists: CHECKOUT_LISTS },
    ]);
    expect(summary).toEqual({ found: 3, placed: 1, failed: 2 });
  });

  it("остановка сервиса — следующий магазин не начинается", async () => {
    const execute = jest.fn().mockResolvedValue(effect(true));
    const shops = jest.fn().mockResolvedValue([
      { id: "s-1", tenant_id: "t-1" },
      { id: "s-2", tenant_id: "t-1" },
    ]);
    let calls = 0;
    const stopped = () => calls++ > 0;
    const summary = await placeCheckoutSets(
      { shops, place: { execute } },
      ["nova"],
      stopped,
      quiet,
    );
    expect(execute).toHaveBeenCalledTimes(1);
    expect(summary).toEqual({ found: 2, placed: 1, failed: 0 });
  });
});

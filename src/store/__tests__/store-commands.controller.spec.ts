/**
 * RPC-вход команд и запросов магазина (этап 3): форма ответа.
 *
 *   sites.cmd.create_store   → { success: true, data: эффект } | { success: false, code, message, …детали }
 *   sites.query.store_status → { success: true, data: вид магазина с состоянием рождения }
 *
 * Отказ лимита по форме совпадает с сегодняшним 402 шлюза
 * (`message: 'shops_limit_reached', limit, current`) — шлюз (кусок 3.5)
 * переводит его в HTTP без пересборки тела.
 */
import { StoreCommandsController } from "../store-commands.controller";
import { makeSiteRow } from "./support/in-memory-lifecycle";

function makeController() {
  const createStore = { execute: jest.fn() };
  const setTheme = { execute: jest.fn() };
  const lifecycle = { read: jest.fn() };
  const controller = new StoreCommandsController(
    createStore as any,
    setTheme as any,
    lifecycle as any,
  );
  return { controller, createStore, setTheme, lifecycle };
}

describe("sites.cmd.create_store", () => {
  it("эффект команды — в data", async () => {
    const { controller, createStore } = makeController();
    createStore.execute.mockResolvedValue({
      ok: true,
      effect: { created: true, waited: false, ready: false },
    });

    const payload = { tenantId: "t1", actorUserId: "u1", name: "Шёлк" };
    const res = await controller.createStore(payload);

    expect(createStore.execute).toHaveBeenCalledWith(payload);
    expect(res).toEqual({
      success: true,
      data: { created: true, waited: false, ready: false },
    });
  });

  it("отказ лимита — тело как у 402 шлюза, плюс машинный code", async () => {
    const { controller, createStore } = makeController();
    createStore.execute.mockResolvedValue({
      ok: false,
      error: { code: "shops_limit_reached", limit: 1, current: 1 },
    });

    expect(await controller.createStore({})).toEqual({
      success: false,
      code: "shops_limit_reached",
      message: "shops_limit_reached",
      limit: 1,
      current: 1,
    });
  });

  it("неожиданная ошибка — success:false с сообщением, RPC не падает", async () => {
    const { controller, createStore } = makeController();
    createStore.execute.mockRejectedValue(new Error("db down"));
    expect(await controller.createStore({})).toEqual({
      success: false,
      code: "internal_error",
      message: "db down",
    });
  });
});

describe("sites.cmd.set_theme", () => {
  it("эффект с отчётом — в data; отказ — code с деталями", async () => {
    const { controller, setTheme } = makeController();
    setTheme.execute.mockResolvedValueOnce({
      ok: true,
      effect: { changed: true, toThemeId: "flux", report: { lost: [] } },
    });
    expect(
      await controller.setTheme({
        tenantId: "t1",
        siteId: "s1",
        themeId: "flux",
      }),
    ).toEqual({
      success: true,
      data: { changed: true, toThemeId: "flux", report: { lost: [] } },
    });

    setTheme.execute.mockResolvedValueOnce({
      ok: false,
      error: { code: "unknown_theme", themeId: "x", available: ["rose"] },
    });
    expect(await controller.setTheme({})).toEqual({
      success: false,
      code: "unknown_theme",
      message: "unknown_theme",
      themeId: "x",
      available: ["rose"],
    });
  });
});

describe("sites.query.store_status", () => {
  it("вид магазина с состоянием рождения", async () => {
    const { controller, lifecycle } = makeController();
    lifecycle.read.mockResolvedValue(
      makeSiteRow({
        id: "s1",
        tenantId: "t1",
        slug: "shyolk",
        lifecycle: "failed",
        lifecycleError: "provision: REG.RU timeout",
        lifecycleAttempts: 2,
        lifecycleNextAt: new Date("2026-09-24T12:00:30Z"),
      }),
    );

    const res = await controller.storeStatus({ tenantId: "t1", siteId: "s1" });

    expect(res).toMatchObject({
      success: true,
      data: {
        id: "s1",
        slug: "shyolk",
        lifecycle: {
          state: "failed",
          error: "provision: REG.RU timeout",
          attempts: 2,
          nextAt: "2026-09-24T12:00:30.000Z",
        },
      },
    });
  });

  it("чужой тенант или нет магазина — site_not_found (граница тенанта)", async () => {
    const { controller, lifecycle } = makeController();
    lifecycle.read.mockResolvedValue(
      makeSiteRow({ id: "s1", tenantId: "other" }),
    );
    expect(
      await controller.storeStatus({ tenantId: "t1", siteId: "s1" }),
    ).toEqual({
      success: false,
      code: "site_not_found",
      message: "site_not_found",
    });
    lifecycle.read.mockResolvedValue(null);
    expect(
      await controller.storeStatus({ tenantId: "t1", siteId: "s1" }),
    ).toEqual({
      success: false,
      code: "site_not_found",
      message: "site_not_found",
    });
  });

  it("без tenantId/siteId — invalid_input", async () => {
    const { controller } = makeController();
    expect(await controller.storeStatus({ siteId: "s1" })).toMatchObject({
      success: false,
      code: "invalid_input",
    });
  });

  it("удалённый магазин — site_not_found", async () => {
    const { controller, lifecycle } = makeController();
    lifecycle.read.mockResolvedValue(
      makeSiteRow({ id: "s1", tenantId: "t1", deletedAt: new Date() }),
    );
    expect(
      await controller.storeStatus({ tenantId: "t1", siteId: "s1" }),
    ).toMatchObject({ success: false, code: "site_not_found" });
  });
});

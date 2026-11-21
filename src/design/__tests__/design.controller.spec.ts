/**
 * RPC «Дизайна по ссылке» без базы: проверка входа схемой, формы ответов по шлюзу api-gateway#127, сбой базы —
 * ответ, а не исключение. Те же RPC на настоящем Postgres — design.store.pg.spec.ts.
 */
import { DesignController, NOT_FOUND } from "../design.controller";
import { normalizeDomain, type StoredLook } from "../design.contract";
import { cappedRaw, storedOf, type DesignStore } from "../design.store";

const LOOK_ID = "0b9d5f7e-3a51-4c8e-9a0f-2f6e9b2c1d10";
const look: StoredLook = {
  id: LOOK_ID,
  url: "https://shop.example/",
  style: { v: 1 },
  outline: { v: 1, blocks: [] },
  content: null,
  createdAt: "2026-11-21T10:00:00.000Z",
};

function fakeStore(
  overrides: Partial<Record<keyof DesignStore, jest.Mock>> = {},
) {
  const store = {
    save: jest.fn().mockResolvedValue(LOOK_ID),
    get: jest.fn().mockResolvedValue(look),
    findRecent: jest.fn().mockResolvedValue(null),
    confirmOwned: jest.fn().mockResolvedValue(undefined),
    isOwned: jest.fn().mockResolvedValue(false),
    ...overrides,
  };
  return store;
}

const controllerWith = (store: ReturnType<typeof fakeStore>) =>
  new DesignController(store as unknown as DesignStore);

const saveInput = {
  siteId: "site-1",
  url: "https://shop.example/",
  finalUrl: "https://shop.example/home",
  tool: "dembrandt",
  toolVersion: "0.41.0",
  outlineTool: "designlang",
  style: { v: 1 },
  outline: { v: 1, blocks: [] },
  content: null,
  raw: { dembrandt: {} },
  ms: 1234,
};

describe("RPC design.* (sites_queue)", () => {
  it("saveLook → { id }; лишние поля шлюза не мешают, обязательные проверяются", async () => {
    const store = fakeStore();
    const controller = controllerWith(store);
    expect(await controller.saveLook(saveInput)).toEqual({
      success: true,
      data: { id: LOOK_ID },
    });
    expect(store.save).toHaveBeenCalledWith(saveInput);
    const bad = await controller.saveLook({ ...saveInput, url: "ftp://x" });
    expect(bad).toMatchObject({ success: false });
    expect(bad.success ? "" : bad.error).toMatch(/^invalid:/);
    expect(await controller.saveLook({ ...saveInput, ms: -1 })).toMatchObject({
      success: false,
    });
  });

  it("getLook → строка; нет записи — success: false; lookId не uuid — отказ без базы", async () => {
    const store = fakeStore();
    const controller = controllerWith(store);
    expect(
      await controller.getLook({ siteId: "site-1", lookId: LOOK_ID }),
    ).toEqual({ success: true, data: look });
    store.get.mockResolvedValueOnce(null);
    expect(
      await controller.getLook({ siteId: "site-1", lookId: LOOK_ID }),
    ).toEqual({ success: false, error: NOT_FOUND });
    expect(
      await controller.getLook({ siteId: "site-1", lookId: "x" }),
    ).toMatchObject({ success: false });
    expect(store.get).toHaveBeenCalledTimes(2);
  });

  it("findRecent → строка или null", async () => {
    const store = fakeStore();
    const controller = controllerWith(store);
    const input = {
      siteId: "site-1",
      url: "https://shop.example/",
      maxAgeMs: 86_400_000,
    };
    expect(await controller.findRecent(input)).toEqual({
      success: true,
      data: null,
    });
    store.findRecent.mockResolvedValueOnce(look);
    expect(await controller.findRecent(input)).toEqual({
      success: true,
      data: look,
    });
    expect(store.findRecent).toHaveBeenCalledWith(
      "site-1",
      "https://shop.example/",
      86_400_000,
    );
    expect(
      await controller.findRecent({ ...input, maxAgeMs: 0 }),
    ).toMatchObject({ success: false });
  });

  it("confirmOwned → { ok: true }, isOwned → { owned }; домен хранится нормализованным", async () => {
    const store = fakeStore({ isOwned: jest.fn().mockResolvedValue(true) });
    const controller = controllerWith(store);
    expect(
      await controller.confirmOwned({
        siteId: "site-1",
        domain: "shop.example",
        userId: "u-1",
      }),
    ).toEqual({ success: true, data: { ok: true } });
    expect(store.confirmOwned).toHaveBeenCalledWith(
      "site-1",
      "shop.example",
      "u-1",
    );
    expect(
      await controller.isOwned({
        siteId: "site-1",
        domain: "WWW.Shop.Example.",
      }),
    ).toEqual({ success: true, data: { owned: true } });
    expect(store.isOwned).toHaveBeenCalledWith("site-1", "shop.example");
    expect(
      await controller.isOwned({ siteId: "site-1", domain: "localhost" }),
    ).toMatchObject({ success: false });
  });

  it("сбой базы — success: false, а не исключение", async () => {
    const store = fakeStore({
      save: jest.fn().mockRejectedValue(new Error("connection refused")),
    });
    expect(await controllerWith(store).saveLook(saveInput)).toEqual({
      success: false,
      error: "internal_error",
    });
  });
});

describe("помощники хранилища", () => {
  it("домен: нижний регистр, без www. и точки в конце; нормальный не меняется", () => {
    expect(normalizeDomain(" WWW.Shop.Example. ")).toBe("shop.example");
    expect(normalizeDomain("shop.example")).toBe("shop.example");
  });

  it("строка наружу — без tool и raw, дата ISO, не объект — пустой объект", () => {
    expect(
      storedOf({
        id: LOOK_ID,
        url: "https://a.b/",
        style: { v: 1 },
        outline: [1],
        content: null,
        createdAt: new Date("2026-11-21T10:00:00Z"),
      }),
    ).toEqual({
      id: LOOK_ID,
      url: "https://a.b/",
      style: { v: 1 },
      outline: {},
      content: null,
      createdAt: "2026-11-21T10:00:00.000Z",
    });
  });

  it("сырой ответ больше 1 МБ — отметка с размером", () => {
    expect(cappedRaw({ a: 1 })).toEqual({ a: 1 });
    const big = cappedRaw({ a: "x".repeat(1_100_000) });
    expect(big).toMatchObject({ truncated: true });
  });
});

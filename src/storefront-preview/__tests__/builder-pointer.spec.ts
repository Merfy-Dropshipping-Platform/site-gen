/**
 * StorefrontBuilderClient.pointerOf: указатель магазина от сборщика (GET /pointer).
 * Любой сбой — null («состояние неизвестно»), а не исключение: статус сборки
 * после этого честно скажет, что проверить не удалось.
 */
import { StorefrontBuilderClient } from "../storefront-builder.client";

const SHOP = "3a9626f7-390d-4a66-bca5-a3b806ca6c1b";

const clientAt = (url: string | undefined) =>
  new StorefrontBuilderClient({ get: () => url } as never);

function answer(status: number, body: string) {
  return {
    status,
    headers: { get: () => "application/json" },
    text: async () => body,
  } as never;
}

describe("StorefrontBuilderClient.pointerOf", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("200 -> build, paused, pending; запрос на /pointer?shop=", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        answer(200, JSON.stringify({ build: 5, paused: true, pending: 7 })),
      );
    global.fetch = fetchMock;

    const pointer = await clientAt("http://builder:8080/").pointerOf(SHOP);

    expect(pointer).toEqual({ build: 5, paused: true, pending: 7 });
    expect(fetchMock.mock.calls[0][0]).toBe(
      `http://builder:8080/pointer?shop=${SHOP}`,
    );
    expect(fetchMock.mock.calls[0][1].method).toBe("GET");
    expect(fetchMock.mock.calls[0][1].signal).toBeDefined();
  });

  it("pending пуст -> null в поле", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        answer(200, JSON.stringify({ build: 5, paused: false, pending: null })),
      );

    expect(await clientAt("http://b").pointerOf(SHOP)).toEqual({
      build: 5,
      paused: false,
      pending: null,
    });
  });

  it.each([
    ["404: у магазина нет указателя", answer(404, "{}")],
    ["500: хранилище упало", answer(500, "{}")],
    ["не JSON", answer(200, "<html>")],
    ["не по формату", answer(200, JSON.stringify({ build: "5", paused: 1 }))],
    [
      "pending не число",
      answer(200, JSON.stringify({ build: 5, paused: false, pending: "x" })),
    ],
  ])("%s -> null", async (_name, response) => {
    global.fetch = jest.fn().mockResolvedValue(response);

    expect(await clientAt("http://b").pointerOf(SHOP)).toBeNull();
  });

  it("сборщик недоступен -> null", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    expect(await clientAt("http://b").pointerOf(SHOP)).toBeNull();
  });

  it("STOREFRONT_BUILDER_URL не задан -> null, сеть не трогаем", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    expect(await clientAt(undefined).pointerOf(SHOP)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

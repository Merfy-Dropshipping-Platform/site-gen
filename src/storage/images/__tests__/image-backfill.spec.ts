import { Logger } from "@nestjs/common";
import { ImageBackfill, findMarked, findUnmarked } from "../image-backfill";
import type { BackfillOptions } from "../image-backfill";
import { ImageVariants } from "../image-variants";
import {
  FakeGenerator,
  MemoryStore,
  fakeNames,
  libOf,
  markerJson,
} from "./doubles";

const OPTIONS: BackfillOptions = {
  prefix: "",
  pauseMs: 300,
  maxAttempts: 3,
  maxLoadPerCore: 0.8,
  overloadPauseMs: 10_000,
};

function setup(initial: Record<string, string>) {
  const store = new MemoryStore(initial);
  const generator = new FakeGenerator();
  const lib = libOf(generator);
  const logger = new Logger("test");
  jest.spyOn(logger, "warn").mockImplementation(() => undefined);
  jest.spyOn(logger, "error").mockImplementation(() => undefined);
  const variants = new ImageVariants(
    store,
    lib,
    { budgetMs: 50, concurrency: 2, maxQueue: 5 },
    logger,
  );
  const pauses: number[] = [];
  const overloaded = jest.fn().mockReturnValue(false);
  const backfill = new ImageBackfill(
    store,
    variants,
    lib,
    OPTIONS,
    {
      isOverloaded: overloaded,
      sleep: async (ms) => {
        pauses.push(ms);
      },
    },
    logger,
  );
  return { store, generator, variants, backfill, pauses, overloaded };
}

describe("findUnmarked", () => {
  const find = (keys: string[]) =>
    findUnmarked(
      keys.map((key) => ({ key, size: 1 })),
      fakeNames.isDerivedKey,
      fakeNames.markerKey,
    );

  it("берёт оригиналы без маркера", () => {
    expect(find(["a.jpg", "imports/s/b.png"])).toEqual([
      "a.jpg",
      "imports/s/b.png",
    ]);
  });

  it("пропускает оригиналы с маркером, копии и сами маркеры", () => {
    expect(
      find([
        "done.jpg",
        "done.jpg.v.json",
        "done.jpg.m.webp",
        "done.jpg.d.webp",
        "new.jpg",
      ]),
    ).toEqual(["new.jpg"]);
  });

  it("пропускает видео и не картинки", () => {
    expect(find(["clip.mp4", "intro.webm", "sheet.csv", "photo.jpg"])).toEqual([
      "photo.jpg",
    ]);
  });

  it("копия, у которой своего маркера нет, не считается оригиналом", () => {
    expect(find(["orphan.jpg.d.webp"])).toEqual([]);
  });
});

describe("ImageBackfill.runPass", () => {
  it("обрабатывает по одной картинке с паузой 300 мс", async () => {
    const { backfill, store, pauses } = setup({ "a.jpg": "x", "b.jpg": "y" });

    const stats = await backfill.runPass();

    expect(stats).toEqual({
      listed: 2,
      pending: 2,
      outdated: 0,
      done: 2,
      failed: 0,
      skipped: 0,
    });
    expect(store.objects.has("a.jpg.v.json")).toBe(true);
    expect(store.objects.has("b.jpg.v.json")).toBe(true);
    expect(pauses).toEqual([300, 300]);
  });

  it("идемпотентно: второй проход ничего не берёт", async () => {
    const { backfill, generator } = setup({ "a.jpg": "x", "clip.mp4": "v" });

    await backfill.runPass();
    const second = await backfill.runPass();

    expect(second.pending).toBe(0);
    expect(generator.calls).toHaveLength(1);
  });

  it("не делает копии копий и не трогает видео", async () => {
    const { backfill, generator } = setup({
      "a.jpg": "x",
      "a.jpg.d.webp": "d",
      "a.jpg.m.webp": "m",
      "clip.mp4": "v",
    });

    await backfill.runPass();

    expect(generator.calls.map((call) => call.key)).toEqual(["a.jpg"]);
  });

  it("сбой чтения: вторая попытка получает previousAttempts 1", async () => {
    const { backfill, store, generator } = setup({ "a.jpg": "x" });
    store.failGetTimes = 1;

    const stats = await backfill.runPass();

    expect(stats.done).toBe(1);
    expect(generator.calls).toHaveLength(1);
    expect(generator.calls[0].previousAttempts).toBe(1);
  });

  it("три сбоя подряд: маркер failed с attempts 3 и больше попыток нет", async () => {
    const { backfill, store, generator } = setup({ "a.jpg": "x" });
    store.failGetTimes = 3;

    const stats = await backfill.runPass();

    expect(stats).toMatchObject({ done: 0, failed: 1 });
    expect(generator.calls).toHaveLength(1);
    expect(generator.calls[0]).toMatchObject({
      key: "a.jpg",
      previousAttempts: 2,
    });
    expect(store.objects.has("a.jpg.v.json")).toBe(true);

    const next = await backfill.runPass();
    expect(next.pending).toBe(0);
  });

  it("битая картинка: генератор вернул failed — считается в failed", async () => {
    const { backfill } = setup({ "broken.jpg": "" });

    const stats = await backfill.runPass();

    expect(stats).toMatchObject({ done: 0, failed: 1 });
  });

  it("картинку, которую сейчас делает загрузка, пропускает", async () => {
    const { backfill, variants, generator } = setup({ "a.jpg": "x" });
    jest.spyOn(variants, "isInFlight").mockReturnValue(true);

    const stats = await backfill.runPass();

    expect(stats.skipped).toBe(1);
    expect(generator.calls).toEqual([]);
  });

  it("сервер загружен: ждёт, пока нагрузка не спадёт", async () => {
    const { backfill, overloaded, pauses, generator } = setup({ "a.jpg": "x" });
    overloaded.mockReturnValueOnce(true).mockReturnValueOnce(true);

    await backfill.runPass();

    expect(pauses.slice(0, 2)).toEqual([10_000, 10_000]);
    expect(generator.calls).toHaveLength(1);
  });

  it("сигнал остановки обрывает проход", async () => {
    const { backfill, generator } = setup({ "a.jpg": "x", "b.jpg": "y" });

    const stats = await backfill.runPass(() => true);

    expect(stats.pending).toBe(2);
    expect(generator.calls).toEqual([]);
  });

  it("пакет не загрузился: проход не начинается и failed не ставит", async () => {
    const { store, variants } = setup({ "a.jpg": "x" });
    const lib = {
      names: async () => fakeNames,
      generator: async () => {
        throw new Error("sharp_missing");
      },
    };
    const backfill = new ImageBackfill(store, variants, lib, OPTIONS);

    await expect(backfill.runPass()).rejects.toThrow("sharp_missing");
    expect(store.objects.has("a.jpg.v.json")).toBe(false);
  });
});

describe("findMarked", () => {
  it("берёт только оригиналы с маркером", () => {
    const objects = [
      "done.jpg",
      "done.jpg.v.json",
      "done.jpg.s.webp",
      "new.jpg",
      "clip.mp4",
      "clip.mp4.v.json",
    ].map((key) => ({ key, size: 1 }));

    expect(
      findMarked(objects, fakeNames.isDerivedKey, fakeNames.markerKey),
    ).toEqual(["done.jpg"]);
  });
});

describe("ImageBackfill.runPass: догенерация по маркеру версии 1", () => {
  const V1_MARKER = markerJson({
    rulesVersion: 1,
    variants: [{ kind: "m", width: 800, key: "a.jpg.m.webp" }],
  });
  const withV1 = (extra: Record<string, string> = {}) =>
    setup({
      "a.jpg": "x",
      "a.jpg.m.webp": "m",
      "a.jpg.v.json": V1_MARKER,
      ...extra,
    });

  it("берёт оригинал с маркером версии 1: делает недостающие копии, готовую не пишет, маркер последним", async () => {
    const { backfill, store, generator } = withV1();

    const stats = await backfill.runPass();

    expect(stats).toMatchObject({ pending: 1, outdated: 1, done: 1 });
    expect(generator.calls[0].previous).toMatchObject({ rulesVersion: 1 });
    expect(store.writes).toEqual([
      "a.jpg.s.webp",
      "a.jpg.d.webp",
      "a.jpg.v.json",
    ]);
    expect(store.objects.get("a.jpg.m.webp")?.toString()).toBe("m");
    const marker = JSON.parse(store.objects.get("a.jpg.v.json").toString());
    expect(marker.rulesVersion).toBe(2);
    expect(marker.variants.map((v: { kind: string }) => v.kind)).toEqual([
      "m",
      "s",
      "d",
    ]);
  });

  it("идемпотентно: второй проход не берёт и маркеры текущей версии не перечитывает", async () => {
    const { backfill, store, generator } = withV1();
    await backfill.runPass();
    const read = jest.spyOn(store, "get");

    const second = await backfill.runPass();
    const third = await backfill.runPass();

    expect(second).toMatchObject({ pending: 0, outdated: 0 });
    expect(third.pending).toBe(0);
    expect(generator.calls).toHaveLength(1);
    expect(read).toHaveBeenCalledTimes(1); // маркер прочитан один раз, на втором проходе
  });

  it("оригиналы без маркера и со старым маркером в одном проходе; свежие и failed не трогает", async () => {
    const { backfill, generator } = withV1({
      "new.jpg": "n",
      "fresh.jpg": "f",
      "fresh.jpg.v.json": markerJson({}),
      "bad.jpg": "b",
      "bad.jpg.v.json": markerJson({
        rulesVersion: 1,
        status: "failed",
        width: null,
        height: null,
      }),
    });

    const stats = await backfill.runPass();

    expect(stats).toMatchObject({ pending: 2, outdated: 1, done: 2 });
    expect(generator.calls.map((call) => call.key).sort()).toEqual([
      "a.jpg",
      "new.jpg",
    ]);
  });

  it("битый маркер не берётся и проход не валит", async () => {
    const { backfill, generator } = setup({
      "a.jpg": "x",
      "a.jpg.v.json": "{oops",
    });

    const stats = await backfill.runPass();

    expect(stats.pending).toBe(0);
    expect(generator.calls).toEqual([]);
  });

  it("оригинал не читается три раза: прежний маркер остаётся с версией 2, копии не теряются", async () => {
    const { backfill, store } = withV1();
    const read = store.get.bind(store);
    jest.spyOn(store, "get").mockImplementation(async (key) => {
      if (key === "a.jpg") throw new Error("storage_down");
      return read(key);
    });

    const stats = await backfill.runPass();

    expect(stats).toMatchObject({ outdated: 1, done: 0, failed: 1 });
    const marker = JSON.parse(store.objects.get("a.jpg.v.json").toString());
    expect(marker).toMatchObject({ status: "ok", rulesVersion: 2 });
    expect(marker.variants).toHaveLength(1);
    expect(store.writes).toEqual(["a.jpg.v.json"]);
  });
});

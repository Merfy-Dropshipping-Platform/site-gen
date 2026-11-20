import { Logger } from "@nestjs/common";
import { ImageBackfill, findUnmarked } from "../image-backfill";
import type { BackfillOptions } from "../image-backfill";
import { ImageVariants } from "../image-variants";
import { FakeGenerator, MemoryStore, fakeNames, libOf } from "./doubles";

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

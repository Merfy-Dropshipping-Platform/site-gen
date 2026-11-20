import { Logger } from "@nestjs/common";
import { ImageVariants, isImageKey } from "../image-variants";
import type { VariantsOptions } from "../image-variants";
import { FakeGenerator, MemoryStore, deferred, libOf } from "./doubles";

const OPTIONS: VariantsOptions = { budgetMs: 50, concurrency: 2, maxQueue: 5 };
const PHOTO = Buffer.from("photo");

function setup(options: Partial<VariantsOptions> = {}) {
  const store = new MemoryStore();
  const generator = new FakeGenerator();
  const logger = new Logger("test");
  const warn = jest.spyOn(logger, "warn").mockImplementation(() => undefined);
  const variants = new ImageVariants(
    store,
    libOf(generator),
    { ...OPTIONS, ...options },
    logger,
  );
  return { store, generator, variants, warn };
}

describe("isImageKey", () => {
  it.each([
    ["a.jpg", true],
    ["imports/shop/abc.WEBP", true],
    ["media/o/s/1-logo.svg", true],
    ["clip.mp4", false],
    ["media/o/s/1-intro.webm", false],
    ["imports/shop/data.csv", false],
    ["no-extension", false],
  ])("%s → %s", (key, expected) => {
    expect(isImageKey(key)).toBe(expected);
  });
});

describe("ImageVariants.processUpload", () => {
  it("уложились в бюджет: копии и маркер записаны до возврата, маркер последним", async () => {
    const { store, variants } = setup();

    await variants.processUpload("uuid-1.jpg", PHOTO);

    expect(store.writes).toEqual([
      "uuid-1.jpg.m.webp",
      "uuid-1.jpg.d.webp",
      "uuid-1.jpg.v.json",
    ]);
    // заголовки копий и маркера задаёт генератор, сервис их не подменяет
    expect(store.headers.get("uuid-1.jpg.v.json")).toEqual({
      contentType: "application/json",
      cacheControl: "x",
    });
  });

  it("не уложились: возвращается по бюджету, копии дописываются в фоне", async () => {
    const { store, generator, variants } = setup({ budgetMs: 20 });
    const gate = deferred();
    generator.gate = gate.promise;

    await variants.processUpload("uuid-2.jpg", PHOTO);
    expect(store.writes).toEqual([]);
    expect(variants.isInFlight("uuid-2.jpg")).toBe(true);

    gate.release();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(store.writes).toEqual([
      "uuid-2.jpg.m.webp",
      "uuid-2.jpg.d.webp",
      "uuid-2.jpg.v.json",
    ]);
    expect(variants.isInFlight("uuid-2.jpg")).toBe(false);
  });

  it("одновременно делается не больше двух картинок, остальные ждут в очереди", async () => {
    const { store, generator, variants } = setup({ budgetMs: 10 });
    const gate = deferred();
    generator.gate = gate.promise;

    await Promise.all(
      ["a", "b", "c", "d"].map((name) =>
        variants.processUpload(`${name}.jpg`, PHOTO),
      ),
    );
    gate.release();
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(generator.maxActive).toBe(2);
    expect(store.writes.filter((key) => key.endsWith(".v.json"))).toHaveLength(
      4,
    );
  });

  it("очередь полна: лишняя картинка пропущена без ошибки, оригинал остаётся без маркера", async () => {
    const { store, generator, variants, warn } = setup({
      budgetMs: 10,
      maxQueue: 0,
    });
    const gate = deferred();
    generator.gate = gate.promise;

    await Promise.all(
      ["a", "b", "c"].map((name) =>
        variants.processUpload(`${name}.jpg`, PHOTO),
      ),
    );
    gate.release();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(store.writes.filter((key) => key.endsWith(".v.json"))).toHaveLength(
      2,
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("c.jpg"));
  });

  it("сбой генератора не роняет загрузку и ничего не пишет", async () => {
    const { store, generator, variants, warn } = setup();
    generator.failWith = new Error("sharp_exploded");

    await expect(
      variants.processUpload("uuid-3.jpg", PHOTO),
    ).resolves.toBeUndefined();

    expect(store.writes).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("sharp_exploded"),
    );
  });

  it.each(["clip.mp4", "data.csv", "uuid.jpg.d.webp", "uuid.jpg.v.json"])(
    "%s пропускается: не картинка или уже копия",
    async (key) => {
      const { store, generator, variants } = setup();

      await variants.processUpload(key, PHOTO);

      expect(generator.calls).toEqual([]);
      expect(store.writes).toEqual([]);
    },
  );
});

describe("ImageVariants.markFailed", () => {
  it("пишет маркер failed с числом попыток", async () => {
    const { store, generator, variants } = setup();

    await variants.markFailed("old.jpg", 3);

    expect(generator.calls[0]).toMatchObject({
      key: "old.jpg",
      previousAttempts: 2,
    });
    expect(store.writes).toEqual(["old.jpg.v.json"]);
  });
});

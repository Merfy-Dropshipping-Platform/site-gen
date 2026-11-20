import { ImageBackfillService } from "../image-backfill.service";
import { ImageBackfill } from "../image-backfill";
import { ImageVariants } from "../image-variants";
import type { MediaImagesService } from "../media-images.service";
import { FakeGenerator, MemoryStore, libOf } from "./doubles";

function setup() {
  const store = new MemoryStore({ "media/o/s/1-a.jpg": "x" });
  const lib = libOf(new FakeGenerator());
  const variants = new ImageVariants(store, lib, {
    budgetMs: 50,
    concurrency: 2,
    maxQueue: 5,
  });
  const images = { store, variants, lib } as unknown as MediaImagesService;
  return new ImageBackfillService(images);
}

describe("ImageBackfillService", () => {
  const originalEnv = process.env;
  let runPass: jest.SpyInstance;

  beforeEach(() => {
    runPass = jest.spyOn(ImageBackfill.prototype, "runPass").mockResolvedValue({
      listed: 1,
      pending: 1,
      outdated: 0,
      done: 1,
      failed: 0,
      skipped: 0,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  it("флага нет — пережатие не запускается", () => {
    process.env = { ...originalEnv };
    delete process.env.IMAGES_BACKFILL_ENABLED;

    setup().onModuleInit();

    expect(runPass).not.toHaveBeenCalled();
  });

  it("флаг не true — тоже не запускается", () => {
    process.env = { ...originalEnv, IMAGES_BACKFILL_ENABLED: "false" };

    setup().onModuleInit();

    expect(runPass).not.toHaveBeenCalled();
  });

  it("флаг true — проход идёт сразу при старте", async () => {
    process.env = { ...originalEnv, IMAGES_BACKFILL_ENABLED: "true" };
    const service = setup();

    service.onModuleInit();
    await new Promise((resolve) => setImmediate(resolve));

    expect(runPass).toHaveBeenCalledTimes(1);
    service.onModuleDestroy();
  });

  it("сорванный проход не роняет сервис", async () => {
    process.env = { ...originalEnv, IMAGES_BACKFILL_ENABLED: "true" };
    runPass.mockRejectedValue(new Error("minio_down"));
    const service = setup();

    expect(() => service.onModuleInit()).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));

    expect(runPass).toHaveBeenCalledTimes(1);
    service.onModuleDestroy();
  });
});

/**
 * Точечная чистка остатков стартового шаблона Astro после выкладки сборки.
 *
 * Выкладка пишет файлы поверх старых и не удаляет пропавшие, поэтому у магазинов,
 * собранных до удаления шаблона из тем, оставался `blog/placeholder/index.html`.
 * Проверяем: удаляются только лишние объекты под `blog/`, переадресация
 * `blog/index.html` и всё остальное остаются, сбой удаления выкладку не ломает.
 */

import { EventEmitter } from "events";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

const mockFPutObject = jest.fn().mockResolvedValue(undefined);
const mockBucketExists = jest.fn().mockResolvedValue(true);
const mockListObjectsV2 = jest.fn();
const mockRemoveObjects = jest.fn().mockResolvedValue(undefined);

jest.mock("minio", () => ({
  Client: jest.fn().mockImplementation(() => ({
    bucketExists: mockBucketExists,
    makeBucket: jest.fn(),
    setBucketPolicy: jest.fn(),
    fPutObject: mockFPutObject,
    listObjectsV2: mockListObjectsV2,
    removeObjects: mockRemoveObjects,
  })),
}));

import { S3StorageService } from "../s3.service";

const LIVE = "sites/abc123/";

/** Поток listObjectsV2: отдаёт только ключи под запрошенным префиксом. */
function listing(existing: string[]) {
  mockListObjectsV2.mockImplementation((_bucket: string, prefix: string) => {
    const stream = new EventEmitter();
    setImmediate(() => {
      for (const name of existing.filter((k) => k.startsWith(prefix))) {
        stream.emit("data", { name });
      }
      stream.emit("end");
    });
    return stream;
  });
}

async function writeDist(dir: string, files: string[]) {
  for (const rel of files) {
    const full = path.join(dir, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, "x");
  }
}

describe("S3StorageService: чистка остатков шаблона под blog/", () => {
  const originalEnv = process.env;
  let dist: string;
  let service: S3StorageService;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      S3_ENDPOINT: "http://localhost:9000",
      S3_ACCESS_KEY: "k",
      S3_SECRET_KEY: "s",
      S3_BUCKET: "merfy-sites",
    };
    dist = await fs.mkdtemp(path.join(os.tmpdir(), "s3-prune-"));
    service = new S3StorageService();
  });

  afterEach(async () => {
    process.env = originalEnv;
    await fs.rm(dist, { recursive: true, force: true });
  });

  it("удаляет только лишние объекты под blog/, переадресацию и остальное не трогает", async () => {
    await writeDist(dist, ["index.html", "blog/index.html", "blogs/novosti/index.html"]);
    listing([
      `${LIVE}blog/index.html`,
      `${LIVE}blog/placeholder/index.html`,
      `${LIVE}blog/first-post/index.html`,
      `${LIVE}index.html`,
      `${LIVE}blogs/novosti/index.html`,
      `${LIVE}_islands/header.html`,
      `${LIVE}build-1.json`,
    ]);

    const { removed } = await service.pruneStaleUnder("merfy-sites", LIVE, dist, ["blog/"]);

    expect(removed.sort()).toEqual(
      [`${LIVE}blog/first-post/index.html`, `${LIVE}blog/placeholder/index.html`].sort(),
    );
    expect(mockRemoveObjects).toHaveBeenCalledTimes(1);
    expect(mockRemoveObjects.mock.calls[0][1].sort()).toEqual(removed.sort());
    // Листинг ходит только по blog/, а не по всему префиксу.
    expect(mockListObjectsV2).toHaveBeenCalledTimes(1);
    expect(mockListObjectsV2).toHaveBeenCalledWith("merfy-sites", `${LIVE}blog/`, true);
  });

  it("не удаляет соседний префикс blogs/ и файл blog.xml", async () => {
    await writeDist(dist, ["index.html"]);
    listing([`${LIVE}blogs/old/index.html`, `${LIVE}blog.xml`]);

    const { removed } = await service.pruneStaleUnder("merfy-sites", LIVE, dist, ["blog/"]);

    expect(removed).toEqual([]);
    expect(mockRemoveObjects).not.toHaveBeenCalled();
  });

  it("пустая сборка ничего не удаляет", async () => {
    listing([`${LIVE}blog/placeholder/index.html`]);

    const { removed } = await service.pruneStaleUnder("merfy-sites", LIVE, dist, ["blog/"]);

    expect(removed).toEqual([]);
    expect(mockListObjectsV2).not.toHaveBeenCalled();
    expect(mockRemoveObjects).not.toHaveBeenCalled();
  });

  it("не принимает префикс вне sites/ и без закрывающего слэша", async () => {
    await writeDist(dist, ["index.html"]);
    await expect(service.pruneStaleUnder("merfy-sites", "branding/t1/", dist, ["blog/"])).rejects.toThrow();
    await expect(service.pruneStaleUnder("merfy-sites", "sites/abc123", dist, ["blog/"])).rejects.toThrow();
    expect(mockRemoveObjects).not.toHaveBeenCalled();
  });

  describe("uploadStaticFiles", () => {
    it("после загрузки удаляет лишнее под blog/ (живой префикс sites/{slug}/)", async () => {
      await writeDist(dist, ["index.html", "blog/index.html"]);
      listing([`${LIVE}blog/index.html`, `${LIVE}blog/placeholder/index.html`]);

      const res = await service.uploadStaticFiles("abc123", "b1", dist);

      expect(res.uploaded).toBe(2);
      expect(mockFPutObject).toHaveBeenCalledTimes(2);
      expect(mockRemoveObjects).toHaveBeenCalledWith("merfy-sites", [`${LIVE}blog/placeholder/index.html`]);
      // порядок: сначала загрузка, потом удаление
      const lastPut = Math.max(...mockFPutObject.mock.invocationCallOrder);
      expect(mockRemoveObjects.mock.invocationCallOrder[0]).toBeGreaterThan(lastPut);
    });

    it("сбой удаления не валит выкладку", async () => {
      await writeDist(dist, ["index.html", "blog/index.html"]);
      listing([`${LIVE}blog/placeholder/index.html`]);
      mockRemoveObjects.mockRejectedValueOnce(new Error("minio down"));

      await expect(service.uploadStaticFiles("abc123", "b1", dist)).resolves.toMatchObject({
        uploaded: 2,
      });
    });

    it("сбой листинга не валит выкладку", async () => {
      await writeDist(dist, ["index.html"]);
      mockListObjectsV2.mockImplementation(() => {
        const stream = new EventEmitter();
        setImmediate(() => stream.emit("error", new Error("list failed")));
        return stream;
      });

      await expect(service.uploadStaticFiles("abc123", "b1", dist)).resolves.toMatchObject({
        uploaded: 1,
      });
      expect(mockRemoveObjects).not.toHaveBeenCalled();
    });

    it("если загрузка упала, чистка не запускается", async () => {
      await writeDist(dist, ["index.html"]);
      listing([`${LIVE}blog/placeholder/index.html`]);
      mockFPutObject.mockRejectedValueOnce(new Error("upload failed"));

      await expect(service.uploadStaticFiles("abc123", "b1", dist)).rejects.toThrow("upload failed");
      expect(mockListObjectsV2).not.toHaveBeenCalled();
      expect(mockRemoveObjects).not.toHaveBeenCalled();
    });
  });
});

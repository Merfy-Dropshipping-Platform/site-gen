/**
 * Методы S3StorageService для копий картинок: запись с заголовками, чтение
 * в буфер и обход бакета по префиксу.
 */
import { Readable } from "stream";

const mockPutObject = jest.fn().mockResolvedValue(undefined);
const mockGetObject = jest.fn();
const mockListObjectsV2 = jest.fn();

jest.mock("minio", () => ({
  Client: jest.fn().mockImplementation(() => ({
    putObject: mockPutObject,
    getObject: mockGetObject,
    listObjectsV2: mockListObjectsV2,
  })),
}));

import { S3StorageService } from "../s3.service";

const originalEnv = process.env;

function configured(): S3StorageService {
  process.env = {
    ...originalEnv,
    S3_ENDPOINT: "http://localhost:9000",
    S3_ACCESS_KEY: "test-access",
    S3_SECRET_KEY: "test-secret",
    S3_BUCKET: "test-bucket",
  };
  return new S3StorageService();
}

function unconfigured(): S3StorageService {
  process.env = { ...originalEnv };
  for (const key of [
    "S3_ENDPOINT",
    "MINIO_ENDPOINT",
    "MINIO_URL",
    "S3_ACCESS_KEY",
    "MINIO_ACCESS_KEY",
    "S3_ACCESS_KEY_ID",
  ]) {
    delete process.env[key];
  }
  return new S3StorageService();
}

describe("S3StorageService: объекты для копий картинок", () => {
  beforeEach(() => jest.clearAllMocks());
  afterAll(() => {
    process.env = originalEnv;
  });

  it("putObjectWithHeaders: длина и заголовки передаются как есть", async () => {
    const body = Buffer.from("webp");

    await configured().putObjectWithHeaders("b", "a.jpg.d.webp", body, {
      "Content-Type": "image/webp",
    });

    expect(mockPutObject).toHaveBeenCalledWith("b", "a.jpg.d.webp", body, 4, {
      "Content-Type": "image/webp",
    });
  });

  it("getObjectBuffer: собирает поток в один буфер", async () => {
    mockGetObject.mockResolvedValue(
      Readable.from([Buffer.from("ab"), Buffer.from("cd")]),
    );

    await expect(configured().getObjectBuffer("b", "a.jpg")).resolves.toEqual(
      Buffer.from("abcd"),
    );
  });

  it("listObjects: рекурсивный обход, записи без имени пропускает", async () => {
    mockListObjectsV2.mockReturnValue(
      Readable.from([
        { name: "media/o/s/1-a.jpg", size: 10 },
        { prefix: "media/o/s/" },
      ]),
    );

    await expect(configured().listObjects("b", "media/")).resolves.toEqual([
      { key: "media/o/s/1-a.jpg", size: 10 },
    ]);
    expect(mockListObjectsV2).toHaveBeenCalledWith("b", "media/", true);
  });

  it.each([
    [
      "putObjectWithHeaders",
      (s: S3StorageService) =>
        s.putObjectWithHeaders("b", "k", Buffer.from("x"), {}),
    ],
    ["getObjectBuffer", (s: S3StorageService) => s.getObjectBuffer("b", "k")],
    ["listObjects", (s: S3StorageService) => s.listObjects("b", "")],
  ])("%s без настроенного S3 — ошибка", async (_name, call) => {
    await expect(call(unconfigured())).rejects.toThrow(
      "S3 client not initialized",
    );
  });
});

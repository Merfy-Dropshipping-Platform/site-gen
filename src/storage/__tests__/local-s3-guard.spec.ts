/**
 * Фаза 1 — «локальная сборка пишет только в локальный MinIO».
 *
 * `.env.local` отслеживается git и содержит боевой
 * `S3_ENDPOINT=https://minio.merfy.ru`, который приоритетнее `MINIO_ENDPOINT`.
 * Из-за этого локальный запуск заливал артефакты сборки в продовый бакет молча:
 * переопределения `MINIO_*` не действовали, а в логе печатался боевой URL,
 * неотличимый от штатного.
 */
import { assertLocalS3Endpoint } from "../s3.service";

const PROD = "https://minio.merfy.ru";

describe("assertLocalS3Endpoint", () => {
  it("вне production удалённый endpoint валит старт", () => {
    expect(() => assertLocalS3Endpoint(PROD, "development", undefined)).toThrow(
      /указывает на удалённый хост "minio\.merfy\.ru"/,
    );
  });

  it("сообщение подсказывает и локальный адрес, и осознанный обход", () => {
    let message = "";
    try {
      assertLocalS3Endpoint(PROD, "development", undefined);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("http://localhost:9010");
    expect(message).toContain("ALLOW_REMOTE_S3=true");
  });

  it.each([
    "http://localhost:9010",
    "localhost:9010",
    "http://127.0.0.1:9000",
    "http://minio:9000",
    "http://merfy-minio:9000",
    "http://host.docker.internal:9010",
  ])("локальный endpoint %s проходит", (endpoint) => {
    expect(() =>
      assertLocalS3Endpoint(endpoint, "development", undefined),
    ).not.toThrow();
  });

  it("в production гейт не вмешивается", () => {
    expect(() =>
      assertLocalS3Endpoint(PROD, "production", undefined),
    ).not.toThrow();
  });

  it("осознанный ALLOW_REMOTE_S3=true снимает запрет", () => {
    expect(() =>
      assertLocalS3Endpoint(PROD, "development", "true"),
    ).not.toThrow();
  });

  it("посторонние значения ALLOW_REMOTE_S3 запрет НЕ снимают", () => {
    for (const v of ["1", "yes", "", "TRUE ", "false"]) {
      expect(() => assertLocalS3Endpoint(PROD, "development", v)).toThrow();
    }
  });
});

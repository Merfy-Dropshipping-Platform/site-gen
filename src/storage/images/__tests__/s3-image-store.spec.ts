import { createS3ImageStore } from "../s3-image-store";
import type { S3StorageService } from "../../s3.service";

function setup(bucket: string | null = "merfy-sites") {
  const s3 = {
    getBucketName: jest.fn(() => bucket),
    putObjectWithHeaders: jest.fn().mockResolvedValue(undefined),
    getObjectBuffer: jest.fn().mockResolvedValue(Buffer.from("bytes")),
    listObjects: jest.fn().mockResolvedValue([{ key: "media/a.jpg", size: 1 }]),
  };
  return { s3, store: createS3ImageStore(s3 as unknown as S3StorageService) };
}

describe("createS3ImageStore", () => {
  it("put: заголовки собираются из типа и Cache-Control", async () => {
    const { s3, store } = setup();
    const body = Buffer.from("webp");

    await store.put("media/a.jpg.d.webp", body, {
      contentType: "image/webp",
      cacheControl: "public, max-age=31536000, immutable",
    });

    expect(s3.putObjectWithHeaders).toHaveBeenCalledWith(
      "merfy-sites",
      "media/a.jpg.d.webp",
      body,
      {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    );
  });

  it("get и list берут бакет сервиса", async () => {
    const { s3, store } = setup();

    await expect(store.get("media/a.jpg")).resolves.toEqual(
      Buffer.from("bytes"),
    );
    await expect(store.list("media/")).resolves.toEqual([
      { key: "media/a.jpg", size: 1 },
    ]);
    expect(s3.getObjectBuffer).toHaveBeenCalledWith(
      "merfy-sites",
      "media/a.jpg",
    );
    expect(s3.listObjects).toHaveBeenCalledWith("merfy-sites", "media/");
  });

  it("бакет не настроен — отказ", () => {
    const { store } = setup(null);

    expect(() => store.get("media/a.jpg")).toThrow("s3_not_configured");
  });
});

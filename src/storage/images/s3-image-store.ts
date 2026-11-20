import type { S3StorageService } from "../s3.service";
import type { ImageStore } from "./image-store";

/** Хранилище картинок поверх бакета sites-сервиса. */
export function createS3ImageStore(s3: S3StorageService): ImageStore {
  const bucket = (): string => {
    const name = s3.getBucketName();
    if (!name) throw new Error("s3_not_configured");
    return name;
  };

  return {
    put: (key, body, { contentType, cacheControl }) =>
      s3.putObjectWithHeaders(bucket(), key, body, {
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
      }),
    get: (key) => s3.getObjectBuffer(bucket(), key),
    list: (prefix) => s3.listObjects(bucket(), prefix),
  };
}

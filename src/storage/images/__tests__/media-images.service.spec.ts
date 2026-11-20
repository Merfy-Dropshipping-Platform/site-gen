import { MediaImagesService } from "../media-images.service";
import type { S3StorageService } from "../../s3.service";
import { FakeGenerator, libOf } from "./doubles";

describe("MediaImagesService", () => {
  it("processUpload пишет копии и маркер в бакет сервиса, маркер последним", async () => {
    const putObjectWithHeaders = jest.fn().mockResolvedValue(undefined);
    const s3 = {
      getBucketName: () => "merfy-sites",
      putObjectWithHeaders,
    } as unknown as S3StorageService;
    const service = new MediaImagesService(s3, libOf(new FakeGenerator()));

    await service.processUpload("media/o/s/1-a.jpg", Buffer.from("photo"));

    expect(putObjectWithHeaders.mock.calls.map(([, key]) => key)).toEqual([
      "media/o/s/1-a.jpg.s.webp",
      "media/o/s/1-a.jpg.m.webp",
      "media/o/s/1-a.jpg.d.webp",
      "media/o/s/1-a.jpg.v.json",
    ]);
    expect(putObjectWithHeaders.mock.calls[0][0]).toBe("merfy-sites");
  });
});

import { MediaUploadController } from "../media-upload.controller";
import { ImageVariants } from "../../storage/images/image-variants";
import type { MediaImagesService } from "../../storage/images/media-images.service";
import {
  FakeGenerator,
  MemoryStore,
  libOf,
} from "../../storage/images/__tests__/doubles";

/**
 * Загрузка медиа: оригинал уходит в бакет, затем копии и маркер рядом с ним.
 * Контроллер создаётся напрямую с мок-S3, без Nest, Postgres и MinIO.
 */
function setup() {
  const bucket = new MemoryStore();
  const generator = new FakeGenerator();
  const variants = new ImageVariants(bucket, libOf(generator), {
    budgetMs: 200,
    concurrency: 2,
    maxQueue: 5,
  });
  const s3 = {
    ensureBucket: jest.fn().mockResolvedValue("merfy-sites"),
    getBucketName: jest.fn(() => "merfy-sites"),
    uploadBuffer: jest.fn(
      async (_bucket: string, key: string, body: Buffer) => {
        await bucket.put(key, body, { contentType: "", cacheControl: "" });
        return `https://s3.example/merfy-sites/${key}`;
      },
    ),
  };
  const sites = {
    getById: jest.fn().mockResolvedValue({ id: "site-1", tenantId: "org-1" }),
  };
  const db = {} as never;
  const images = variants as unknown as MediaImagesService;
  const controller = new MediaUploadController(
    s3 as never,
    images,
    sites as never,
    db,
  );
  return { controller, bucket, generator };
}

const file = (name: string, mimetype: string) =>
  ({
    originalname: name,
    mimetype,
    size: 5,
    buffer: Buffer.from("photo"),
  }) as Express.Multer.File;

describe("MediaUploadController.upload: копии картинок", () => {
  it("картинка: оригинал, затем копии и маркер, всё до ответа", async () => {
    const { controller, bucket } = setup();

    const { url } = await controller.upload(
      "site-1",
      file("Hero Photo.jpg", "image/jpeg"),
    );

    const [original] = bucket.writes;
    expect(original).toMatch(/^media\/org-1\/site-1\/\d+-Hero_Photo\.jpg$/);
    expect(url).toContain(original);
    expect(bucket.writes).toEqual([
      original,
      `${original}.s.webp`,
      `${original}.m.webp`,
      `${original}.d.webp`,
      `${original}.v.json`,
    ]);
  });

  it("видео: копий нет, генератор не вызывается", async () => {
    const { controller, bucket, generator } = setup();

    await controller.upload("site-1", file("intro.mp4", "video/mp4"));

    expect(bucket.writes).toHaveLength(1);
    expect(generator.calls).toEqual([]);
  });

  it("сбой генератора не ломает загрузку: адрес возвращён, оригинал на месте", async () => {
    const { controller, bucket, generator } = setup();
    generator.failWith = new Error("sharp_exploded");

    const { url } = await controller.upload(
      "site-1",
      file("a.png", "image/png"),
    );

    expect(url).toContain("/media/org-1/site-1/");
    expect(bucket.writes).toHaveLength(1);
  });
});

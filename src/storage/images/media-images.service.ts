import { Inject, Injectable, Optional } from "@nestjs/common";
import { S3StorageService } from "../s3.service";
import { variantsOptionsFrom } from "./image-config";
import type { ImageStore } from "./image-store";
import { ImageVariants } from "./image-variants";
import { defaultImagesLib, IMAGES_LIB } from "./images-lib";
import type { ImagesLib } from "./images-lib";
import { createS3ImageStore } from "./s3-image-store";

/** Копии картинок медиа сайтов: общая очередь для загрузок и фонового пережатия. */
@Injectable()
export class MediaImagesService {
  readonly store: ImageStore;
  readonly variants: ImageVariants;

  constructor(
    readonly s3: S3StorageService,
    @Optional()
    @Inject(IMAGES_LIB)
    readonly lib: ImagesLib = defaultImagesLib,
  ) {
    this.store = createS3ImageStore(s3);
    this.variants = new ImageVariants(
      this.store,
      lib,
      variantsOptionsFrom(process.env),
    );
  }

  /** После загрузки оригинала в бакет: копии и маркер в бюджет, остальное в фоне. */
  processUpload(key: string, bytes: Buffer): Promise<void> {
    return this.variants.processUpload(key, bytes);
  }
}

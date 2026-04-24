import {
  Controller,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { S3StorageService } from "../storage/s3.service";
import { SitesDomainService } from "../sites.service";
import * as path from "path";

/**
 * Media upload for constructor blocks (Video, Hero image, gallery items).
 *
 * Accepts any multipart `file` field, uploads to MinIO under
 * `media/<tenantId>/<siteId>/<timestamp>-<filename>`, returns the public URL.
 *
 * Previously the constructor wrote `URL.createObjectURL(file)` (transient
 * blob: URL) or `FileReader.readAsDataURL(file)` (base64 in JSONB). Both
 * broke on the live site: blob URLs don't leave the browser tab, and
 * base64 inflates revisions to 30+ MB each. This endpoint is the permanent
 * replacement: merchant uploads → S3 stores → revision keeps only the URL.
 *
 * POST /api/sites/:siteId/media
 *   form-data: file=<blob>
 *   → { success: true, url: string, key: string }
 *
 * Public endpoint (matches branding.controller pattern). Authorisation
 * happens at the gateway layer.
 */
@Controller("api/sites/:siteId/media")
export class MediaUploadController {
  private readonly logger = new Logger(MediaUploadController.name);

  constructor(
    private readonly s3: S3StorageService,
    private readonly sitesService: SitesDomainService,
  ) {}

  @Post()
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB — enough for short clips
      fileFilter: (_req, file, cb) => {
        const allowed = [
          "image/jpeg",
          "image/jpg",
          "image/png",
          "image/webp",
          "image/gif",
          "image/svg+xml",
          "video/mp4",
          "video/webm",
          "video/ogg",
          "video/quicktime",
        ];
        cb(null, allowed.includes(file.mimetype));
      },
    }),
  )
  async upload(
    @Param("siteId") siteId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new HttpException(
        "no_file_uploaded_or_type_unsupported",
        HttpStatus.BAD_REQUEST,
      );
    }

    const site = await this.sitesService.getById(siteId);
    if (!site) {
      throw new HttpException("site_not_found", HttpStatus.NOT_FOUND);
    }

    const tenantId = site.tenantId;
    const ts = Date.now();
    const safeBase = (path.basename(file.originalname) || "file")
      .replace(/[^a-zA-Z0-9.\-_]/g, "_")
      .slice(0, 80);
    const ext = path.extname(safeBase).replace(".", "") || "bin";
    const nameWithoutExt = safeBase.replace(/\.[^.]*$/, "").slice(0, 40);
    const key = `media/${tenantId}/${siteId}/${ts}-${nameWithoutExt}.${ext}`;

    try {
      await this.s3.ensureBucket();
      const bucket = this.s3.getBucketName();
      if (!bucket) {
        throw new HttpException(
          "s3_not_configured",
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      const url = await this.s3.uploadBuffer(
        bucket,
        key,
        file.buffer,
        file.mimetype,
      );
      this.logger.log(
        `Media uploaded for site ${siteId}: ${url} (${file.size}B, ${file.mimetype})`,
      );
      return { success: true, url, key };
    } catch (error) {
      this.logger.error(
        `Media upload failed for site ${siteId}: ${error instanceof Error ? error.message : error}`,
      );
      throw new HttpException(
        "upload_failed",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

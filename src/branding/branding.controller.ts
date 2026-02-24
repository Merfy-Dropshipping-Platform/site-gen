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

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/svg+xml",
];

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

@Controller("branding")
export class BrandingController {
  private readonly logger = new Logger(BrandingController.name);

  constructor(
    private readonly s3: S3StorageService,
    private readonly sitesService: SitesDomainService,
  ) {}

  @Post(":siteId/logo")
  @UseInterceptors(
    FileInterceptor("logo", {
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (_req, file, cb) => {
        cb(null, ALLOWED_MIME_TYPES.includes(file.mimetype));
      },
    }),
  )
  async uploadLogo(
    @Param("siteId") siteId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new HttpException("no_file_uploaded", HttpStatus.BAD_REQUEST);
    }

    // Look up site to get tenantId
    const site = await this.sitesService.getById(siteId);
    if (!site) {
      throw new HttpException("site_not_found", HttpStatus.NOT_FOUND);
    }

    const tenantId = site.tenantId;
    const ext = path.extname(file.originalname).replace(".", "") || "png";
    const key = `branding/${tenantId}/${siteId}/logo.${ext}`;

    try {
      await this.s3.ensureBucket();
      const bucket = this.s3.getBucketName();
      if (!bucket) {
        throw new HttpException("s3_not_configured", HttpStatus.INTERNAL_SERVER_ERROR);
      }
      const logoUrl = await this.s3.uploadBuffer(
        bucket,
        key,
        file.buffer,
        file.mimetype,
      );

      // Update site.branding.logoUrl
      const currentBranding =
        (site.branding as Record<string, unknown>) ?? {};
      await this.sitesService.update({
        tenantId,
        siteId,
        patch: {
          branding: { ...currentBranding, logoUrl },
        },
      });

      this.logger.log(`Logo uploaded for site ${siteId}: ${logoUrl}`);
      return { success: true, logoUrl };
    } catch (error) {
      this.logger.error(
        `Logo upload failed for site ${siteId}: ${error instanceof Error ? error.message : error}`,
      );
      throw new HttpException(
        "upload_failed",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

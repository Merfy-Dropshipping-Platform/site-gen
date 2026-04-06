import {
  Controller,
  Delete,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
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

const FAVICON_ALLOWED_MIME_TYPES = [
  ...ALLOWED_MIME_TYPES,
  "image/x-icon",
  "image/vnd.microsoft.icon",
];

const FAVICON_TYPES = ['universal', 'dark', 'light', 'apple'] as const;
type FaviconType = (typeof FAVICON_TYPES)[number];

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

/**
 * Sanitize SVG by removing dangerous elements and attributes.
 * Strips: <script>, <foreignObject>, <use> with external href,
 * event handlers (onload, onclick, etc.), and external resource references.
 */
function sanitizeSvg(buffer: Buffer): Buffer {
  let svg = buffer.toString("utf-8");

  // Remove script tags and their content
  svg = svg.replace(/<script[\s\S]*?<\/script>/gi, "");
  svg = svg.replace(/<script[^>]*\/>/gi, "");

  // Remove foreignObject (can embed HTML)
  svg = svg.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "");

  // Remove event handler attributes (on*)
  svg = svg.replace(/\s+on\w+\s*=\s*"[^"]*"/gi, "");
  svg = svg.replace(/\s+on\w+\s*=\s*'[^']*'/gi, "");

  // Remove href/xlink:href to external URLs (keep internal #refs)
  svg = svg.replace(
    /\s+(xlink:)?href\s*=\s*"(?!#)[^"]*"/gi,
    "",
  );
  svg = svg.replace(
    /\s+(xlink:)?href\s*=\s*'(?!#)[^']*'/gi,
    "",
  );

  // Remove <use> elements with external references
  svg = svg.replace(/<use[^>]*>/gi, (match) => {
    // Keep only <use> with internal #id references
    if (/#/.test(match)) return match;
    return "";
  });

  // Remove <image> elements with external src
  svg = svg.replace(/<image[^>]*>/gi, "");

  // Remove data: URIs in attributes (potential JS execution)
  svg = svg.replace(/\s+\w+\s*=\s*"data:(?!image\/)[^"]*"/gi, "");

  return Buffer.from(svg, "utf-8");
}

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
    const ts = Date.now();
    const key = `branding/${tenantId}/${siteId}/logo-${ts}.${ext}`;

    // Sanitize SVG files to prevent XSS
    let uploadBuffer = file.buffer;
    if (file.mimetype === "image/svg+xml") {
      uploadBuffer = sanitizeSvg(file.buffer);
      this.logger.log(`SVG sanitized for site ${siteId}`);
    }

    try {
      await this.s3.ensureBucket();
      const bucket = this.s3.getBucketName();
      if (!bucket) {
        throw new HttpException("s3_not_configured", HttpStatus.INTERNAL_SERVER_ERROR);
      }
      const logoUrl = await this.s3.uploadBuffer(
        bucket,
        key,
        uploadBuffer,
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

  @Post(":siteId/favicon")
  @UseInterceptors(
    FileInterceptor("favicon", {
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (_req, file, cb) => {
        cb(null, FAVICON_ALLOWED_MIME_TYPES.includes(file.mimetype));
      },
    }),
  )
  async uploadFavicon(
    @Param("siteId") siteId: string,
    @Query("type") faviconType: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!faviconType || !FAVICON_TYPES.includes(faviconType as FaviconType)) {
      throw new HttpException(
        `invalid_favicon_type. Allowed: ${FAVICON_TYPES.join(", ")}`,
        HttpStatus.BAD_REQUEST,
      );
    }

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
    const ts = Date.now();
    const key = `branding/${tenantId}/${siteId}/favicon-${faviconType}-${ts}.${ext}`;

    // Sanitize SVG files to prevent XSS
    let uploadBuffer = file.buffer;
    if (file.mimetype === "image/svg+xml") {
      uploadBuffer = sanitizeSvg(file.buffer);
      this.logger.log(`SVG favicon sanitized for site ${siteId}`);
    }

    try {
      await this.s3.ensureBucket();
      const bucket = this.s3.getBucketName();
      if (!bucket) {
        throw new HttpException("s3_not_configured", HttpStatus.INTERNAL_SERVER_ERROR);
      }
      const faviconUrl = await this.s3.uploadBuffer(
        bucket,
        key,
        uploadBuffer,
        file.mimetype,
      );

      // Update site.branding.favicons.{type}
      const currentBranding =
        (site.branding as Record<string, unknown>) ?? {};
      const currentFavicons =
        (currentBranding.favicons as Record<string, unknown>) ?? {};
      await this.sitesService.update({
        tenantId,
        siteId,
        patch: {
          branding: {
            ...currentBranding,
            favicons: { ...currentFavicons, [faviconType]: faviconUrl },
          },
        },
      });

      this.logger.log(
        `Favicon (${faviconType}) uploaded for site ${siteId}: ${faviconUrl}`,
      );
      return { success: true, faviconUrl, type: faviconType };
    } catch (error) {
      this.logger.error(
        `Favicon upload failed for site ${siteId}: ${error instanceof Error ? error.message : error}`,
      );
      throw new HttpException(
        "upload_failed",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(":siteId/favicon")
  async deleteFavicon(
    @Param("siteId") siteId: string,
    @Query("type") faviconType: string,
  ) {
    if (!faviconType || !FAVICON_TYPES.includes(faviconType as FaviconType)) {
      throw new HttpException(
        `invalid_favicon_type. Allowed: ${FAVICON_TYPES.join(", ")}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Look up site to get tenantId
    const site = await this.sitesService.getById(siteId);
    if (!site) {
      throw new HttpException("site_not_found", HttpStatus.NOT_FOUND);
    }

    const tenantId = site.tenantId;

    try {
      const currentBranding =
        (site.branding as Record<string, unknown>) ?? {};
      const currentFavicons =
        (currentBranding.favicons as Record<string, unknown>) ?? {};
      delete currentFavicons[faviconType];
      await this.sitesService.update({
        tenantId,
        siteId,
        patch: {
          branding: { ...currentBranding, favicons: currentFavicons },
        },
      });

      this.logger.log(`Favicon (${faviconType}) deleted for site ${siteId}`);
      return { success: true };
    } catch (error) {
      this.logger.error(
        `Favicon delete failed for site ${siteId}: ${error instanceof Error ? error.message : error}`,
      );
      throw new HttpException(
        "delete_failed",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

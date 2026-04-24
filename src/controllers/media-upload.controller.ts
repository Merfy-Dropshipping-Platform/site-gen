import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, sql } from "drizzle-orm";
import { S3StorageService } from "../storage/s3.service";
import { SitesDomainService } from "../sites.service";
import * as schema from "../db/schema";
import { PG_CONNECTION } from "../constants";
import * as path from "path";

/**
 * Media upload for constructor blocks (Video, Hero image, gallery items).
 *
 * Two endpoints:
 *   POST /api/sites/:siteId/media/:blockId
 *     - Upload file to MinIO + upsert current URL into `site_media` table.
 *     - Live storefront reads this table at runtime, so swapping a video
 *       does NOT require creating a new site_revision or rebuilding the
 *       Astro artifact. Save/Publish stays as a workflow step for
 *       structural/copy changes only.
 *   GET  /api/sites/:siteId/blocks/:blockId/media
 *     - Returns the current URL for a given block. Called by a tiny
 *       client script inline in every Video/Media block render. Returns
 *       404 if nothing uploaded yet (caller shows placeholder).
 *
 * Legacy endpoint kept:
 *   POST /api/sites/:siteId/media  (no blockId)
 *     - Same file upload but does NOT touch site_media. Returns URL for
 *       clients that still want the old "paste URL into revision" flow.
 *
 * Public endpoints — auth happens at the gateway.
 */
@Controller("api/sites/:siteId")
export class MediaUploadController {
  private readonly logger = new Logger(MediaUploadController.name);

  constructor(
    private readonly s3: S3StorageService,
    private readonly sitesService: SitesDomainService,
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  private readonly ALLOWED_MIME = [
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

  /**
   * New flow: upload + save to site_media so live reads current URL at
   * runtime. No rebuild, no new revision.
   */
  @Post("media/:blockId")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 50 * 1024 * 1024 },
      fileFilter: function (_req, file, cb) {
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
  async uploadToSlot(
    @Param("siteId") siteId: string,
    @Param("blockId") blockId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const url = await this.uploadToMinio(siteId, file);
    // Upsert into site_media
    await this.db
      .insert(schema.siteMedia)
      .values({
        siteId,
        blockId,
        url,
        mimeType: file.mimetype,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [schema.siteMedia.siteId, schema.siteMedia.blockId],
        set: {
          url,
          mimeType: file.mimetype,
          updatedAt: new Date(),
        },
      });
    this.logger.log(
      `Media slot updated: site=${siteId} block=${blockId} → ${url}`,
    );
    return { success: true, url, blockId };
  }

  /**
   * Legacy flow: upload only, no site_media write. Kept so callers that
   * still paste URL into revision (e.g. ImageUploadField during the
   * transition) keep working.
   */
  @Post("media")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 50 * 1024 * 1024 },
      fileFilter: function (_req, file, cb) {
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
    const url = await this.uploadToMinio(siteId, file);
    return { success: true, url };
  }

  /**
   * Live storefront calls this to learn the current URL for a media slot.
   * Returns { url } or 404 when the slot is still empty.
   */
  @Get("blocks/:blockId/media")
  async getSlot(
    @Param("siteId") siteId: string,
    @Param("blockId") blockId: string,
  ) {
    const [row] = await this.db
      .select({
        url: schema.siteMedia.url,
        mimeType: schema.siteMedia.mimeType,
        coverImage: schema.siteMedia.coverImage,
        updatedAt: schema.siteMedia.updatedAt,
      })
      .from(schema.siteMedia)
      .where(
        and(
          eq(schema.siteMedia.siteId, siteId),
          eq(schema.siteMedia.blockId, blockId),
        ),
      )
      .limit(1);
    if (!row) {
      throw new HttpException("slot_empty", HttpStatus.NOT_FOUND);
    }
    return {
      url: row.url,
      mimeType: row.mimeType,
      coverImage: row.coverImage,
      updatedAt: row.updatedAt,
    };
  }

  private async uploadToMinio(
    siteId: string,
    file: Express.Multer.File,
  ): Promise<string> {
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
      return url;
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

// Silence unused-import warning for `sql` (might be needed for future upsert patterns).
void sql;

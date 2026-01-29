/**
 * ContentSyncScheduler
 *
 * Периодически проверяет опубликованные сайты на наличие контента в S3.
 * Если контент отсутствует — автоматически запускает генерацию.
 *
 * Это гарантирует что активные пользователи всегда имеют работающие сайты.
 */
import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { PG_CONNECTION } from "../constants";
import * as schema from "../db/schema";
import { and, eq, sql, inArray } from "drizzle-orm";
import { S3StorageService } from "../storage/s3.service";
import { SiteGeneratorService } from "../generator/generator.service";

@Injectable()
export class ContentSyncScheduler implements OnModuleInit {
  private readonly logger = new Logger(ContentSyncScheduler.name);

  constructor(
    @Inject(PG_CONNECTION) private readonly db: NodePgDatabase<typeof schema>,
    private readonly storage: S3StorageService,
    private readonly generator: SiteGeneratorService,
  ) {}

  /**
   * Запускает синхронизацию контента при старте сервиса.
   */
  async onModuleInit() {
    // Отложенный запуск чтобы дать сервисам время на инициализацию
    setTimeout(() => {
      this.logger.log("Running initial content sync on startup...");
      this.syncContent().catch((e) => {
        this.logger.warn(`Initial content sync failed: ${e instanceof Error ? e.message : e}`);
      });
    }, 15000); // 15 секунд после старта
  }

  /**
   * Синхронизация контента каждые 10 минут.
   * Проверяет опубликованные сайты и генерирует контент если отсутствует.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async syncContent() {
    if (
      (process.env.CONTENT_SYNC_CRON_ENABLED ?? "true").toLowerCase() === "false"
    ) {
      return;
    }

    if (!(await this.storage.isEnabled())) {
      this.logger.debug("Content sync: S3 not enabled, skipping");
      return;
    }

    this.logger.log("Content sync cron: start");

    try {
      // Получаем все активные (не удалённые, не frozen) сайты со статусом published
      const sites = await this.db
        .select({
          id: schema.site.id,
          tenantId: schema.site.tenantId,
          publicUrl: schema.site.publicUrl,
          status: schema.site.status,
        })
        .from(schema.site)
        .where(
          and(
            sql`${schema.site.deletedAt} IS NULL`,
            inArray(schema.site.status, ["published", "draft"]),
          ),
        );

      this.logger.log(`Content sync: checking ${sites.length} active sites`);

      let builtCount = 0;
      let errorCount = 0;

      for (const site of sites) {
        try {
          // Определяем S3 prefix для сайта
          const prefix = site.publicUrl
            ? this.storage.getSitePrefixBySubdomain(site.publicUrl)
            : `sites/${site.tenantId}/${site.id}/`;

          // Проверяем наличие index.html
          const check = await this.storage.checkSiteFiles(prefix);

          if (!check.hasIndex) {
            this.logger.log(
              `Content sync: site ${site.id} (${site.publicUrl ?? "no url"}) has no content, building...`,
            );

            const buildResult = await this.generator.build({
              tenantId: site.tenantId,
              siteId: site.id,
              mode: "production",
            });

            this.logger.log(
              `Content sync: built site ${site.id}, artifact: ${buildResult.artifactUrl}`,
            );
            builtCount++;
          }
        } catch (e) {
          this.logger.warn(
            `Content sync: failed for site ${site.id}: ${e instanceof Error ? e.message : e}`,
          );
          errorCount++;
        }
      }

      this.logger.log(
        `Content sync cron: done. Built ${builtCount} sites, ${errorCount} errors`,
      );
    } catch (e) {
      this.logger.warn(
        `Content sync cron failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }
}

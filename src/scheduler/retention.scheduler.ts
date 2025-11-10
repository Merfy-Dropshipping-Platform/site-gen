import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { PG_CONNECTION } from '../constants';
import * as schema from '../db/schema';
import { and, isNotNull, lt } from 'drizzle-orm';
import * as fs from 'fs/promises';
import * as path from 'path';
import { S3StorageService } from '../storage/s3.service';

@Injectable()
export class RetentionScheduler {
  private readonly logger = new Logger(RetentionScheduler.name);

  constructor(
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly storage: S3StorageService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupArtifacts() {
    const days = Number.parseInt(String(process.env.ARTIFACT_RETENTION_DAYS ?? 14), 10);
    if (!Number.isFinite(days) || days <= 0) return;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    this.logger.log(`Retention job: removing artifacts older than ${days}d`);

    // Выберем старые билды
    const rows = await this.db
      .select({
        id: schema.siteBuild.id,
        siteId: schema.siteBuild.siteId,
        artifactUrl: schema.siteBuild.artifactUrl,
        s3Bucket: schema.siteBuild.s3Bucket,
        s3KeyPrefix: schema.siteBuild.s3KeyPrefix,
        completedAt: schema.siteBuild.completedAt,
      })
      .from(schema.siteBuild)
      .where(and(isNotNull(schema.siteBuild.completedAt), lt(schema.siteBuild.completedAt, cutoff)));

    // Удалим локальные файлы
    for (const r of rows) {
      if (r.artifactUrl?.startsWith('file://')) {
        try {
          const localPath = r.artifactUrl.replace('file://', '');
          await fs.rm(localPath, { force: true });
        } catch {}
      } else if (r.artifactUrl?.startsWith('/')) {
        // На случай абсолютного пути
        try {
          await fs.rm(r.artifactUrl, { force: true });
        } catch {}
      }
    }

    // Удалим объекты в S3/Minio
    try {
      if (await this.storage.isEnabled()) {
        const bucket = await this.storage.ensureBucket();
        for (const r of rows) {
          if (r.s3KeyPrefix) {
            try {
              // Здесь мы удаляем именно объект по ключу билда, а не весь префикс
              await this.storage.removeObject(bucket, r.s3KeyPrefix);
            } catch {}
          }
        }
      }
    } catch (e) {
      this.logger.warn(`S3 retention failed: ${e instanceof Error ? e.message : e}`);
    }

    this.logger.log(`Retention job completed for ${rows.length} builds`);
  }
}


import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { PG_CONNECTION } from "../constants";
import * as schema from "../db/schema";
import { desc, isNotNull } from "drizzle-orm";
import * as fs from "fs/promises";
import { S3StorageService } from "../storage/s3.service";

/**
 * RetentionScheduler — авто-очистка старых build-артефактов сайтов.
 *
 * Каждая публикация грузит полный dist в S3 ДВАЖДЫ:
 *  1. live-префикс `sites/<slug>/`         — перезаписывается на месте, это ОТДАЁТ nginx;
 *  2. per-build `sites/<slug>/<buildId>/artifact.zip` — архив сборки, копится НАВСЕГДА.
 *
 * Без ретеншена (2) рос неограниченно (сотни версий/сайт, 107GB) → диск 100% → прод падал.
 *
 * Здесь оставляем `ARTIFACT_RETENTION_KEEP` (по умолчанию 3) свежих сборок на сайт
 * (для отката) и удаляем per-build префиксы более старых. Инвариант безопасности:
 * удаляем ТОЛЬКО `sites/<slug>/<buildId>/` (глубже live-префикса) — живой сайт
 * (top-level `sites/<slug>/{_astro,index.html,...}`) НИКОГДА не трогаем.
 *
 * ⚠️ Прошлая версия звала `removeObject(bucket, s3KeyPrefix)`, где s3KeyPrefix =
 * `sites/<slug>/` (live-префикс, одинаков для всех сборок) → это (а) no-op на префиксе,
 * (б) целило в живой сайт. Ничего не чистилось. Фикс: removePrefix + правильный per-build путь.
 */
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
    // Сколько последних сборок оставлять на сайт (для отката). Остальные артефакты чистим.
    const keep = Number.parseInt(
      String(process.env.ARTIFACT_RETENTION_KEEP ?? 3),
      10,
    );
    if (!Number.isFinite(keep) || keep < 1) return;

    // Все завершённые сборки, свежие первыми → группируем по сайту, режем «хвост».
    const rows = await this.db
      .select({
        id: schema.siteBuild.id,
        siteId: schema.siteBuild.siteId,
        artifactUrl: schema.siteBuild.artifactUrl,
        s3KeyPrefix: schema.siteBuild.s3KeyPrefix,
        completedAt: schema.siteBuild.completedAt,
      })
      .from(schema.siteBuild)
      .where(isNotNull(schema.siteBuild.completedAt))
      .orderBy(desc(schema.siteBuild.completedAt));

    const bySite = new Map<string, typeof rows>();
    for (const r of rows) {
      const arr = bySite.get(r.siteId) ?? [];
      arr.push(r);
      bySite.set(r.siteId, arr);
    }
    // Для каждого сайта первые `keep` (самые свежие) оставляем, остальные — на удаление.
    const toDelete: typeof rows = [];
    for (const builds of bySite.values()) {
      if (builds.length > keep) toDelete.push(...builds.slice(keep));
    }
    if (toDelete.length === 0) {
      this.logger.log("Retention: nothing to clean");
      return;
    }
    this.logger.log(
      `Retention: keep ${keep} newest builds/site, cleaning ${toDelete.length} old build artifacts`,
    );

    // 1. Локальные файлы (file:// артефакты).
    for (const r of toDelete) {
      if (r.artifactUrl?.startsWith("file://")) {
        try {
          await fs.rm(r.artifactUrl.replace("file://", ""), { force: true });
        } catch {}
      } else if (r.artifactUrl?.startsWith("/")) {
        try {
          await fs.rm(r.artifactUrl, { force: true });
        } catch {}
      }
    }

    // 2. S3/MinIO: удаляем per-build префикс sites/<slug>/<buildId>/ (НЕ live-префикс!).
    let removed = 0;
    let failed = 0;
    try {
      if (await this.storage.isEnabled()) {
        const bucket = await this.storage.ensureBucket();
        for (const r of toDelete) {
          const base = r.s3KeyPrefix; // sites/<slug>/
          if (!base || !base.startsWith("sites/") || !base.endsWith("/") || !r.id)
            continue;
          const buildPrefix = `${base}${r.id}/`; // sites/<slug>/<buildId>/
          // ИНВАРИАНТ: удаляемый префикс СТРОГО ГЛУБЖЕ live-префикса сайта.
          // Никогда не сносим сам sites/<slug>/ (там живой сайт).
          if (
            buildPrefix === base ||
            !buildPrefix.startsWith(base) ||
            buildPrefix.length <= base.length
          )
            continue;
          try {
            const res = await this.storage.removePrefix(bucket, buildPrefix);
            removed += res.removed;
          } catch {
            failed += 1;
          }
        }
      }
    } catch (e) {
      this.logger.warn(
        `S3 retention failed: ${e instanceof Error ? e.message : e}`,
      );
    }

    this.logger.log(
      `Retention done: ${toDelete.length} old builds, ${removed} S3 objects removed${failed ? `, ${failed} prefixes failed` : ""}`,
    );
  }
}

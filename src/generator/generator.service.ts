/**
 * SiteGeneratorService — сервис генерации.
 *
 * Текущая версия — заглушка, имитирующая пайплайн сборки:
 * 1) создаёт запись в `site_revision` (data/meta)
 * 2) добавляет `site_build` со статусом queued
 * 3) переводит билд в running, пишет локальный артефакт, затем проставляет uploaded
 *
 * В продакшене здесь следует вызывать генератор Astro+React и паковать результат (zip/tar),
 * а затем выгружать артефакт в S3/Minio и сохранять ссылку в `artifactUrl`.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { PG_CONNECTION } from '../constants';
import * as schema from '../db/schema';
import { buildWithAstro } from './astro.builder';
import { S3StorageService } from '../storage/s3.service';

@Injectable()
export class SiteGeneratorService {
  private readonly logger = new Logger(SiteGeneratorService.name);

  constructor(
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly s3: S3StorageService,
  ) {}

  async build(params: { tenantId: string; siteId: string; mode?: 'draft' | 'production' }) {
    // Подтянуть текущую тему/ревизию и собрать артефакт с единым именем <buildId>.zip
    let revisionId: string | null = null;
    const buildId = randomUUID();
    const now = new Date();

    // Определяем, какую ревизию брать: приоритет — currentRevisionId, если нет — создаём с темой
    const [siteRow] = await this.db
      .select({ id: schema.site.id, theme: schema.site.theme, currentRevisionId: schema.site.currentRevisionId })
      .from(schema.site)
      .where(eq(schema.site.id, params.siteId));

    if (siteRow?.currentRevisionId) {
      // Проверяем, что ревизия существует
      const [rev] = await this.db
        .select({ id: schema.siteRevision.id })
        .from(schema.siteRevision)
        .where(and(eq(schema.siteRevision.id, siteRow.currentRevisionId), eq(schema.siteRevision.siteId, params.siteId)));
      if (rev) {
        revisionId = rev.id;
      }
    }

    // Если текущая ревизия не найдена — создаём новую из темы сайта
    if (!revisionId) {
      const theme = (siteRow?.theme as any) ?? {};
      const data = Array.isArray(theme?.content) || typeof theme?.content === 'object' ? theme : { content: [], meta: { title: 'Мой сайт' } };
      revisionId = randomUUID();
      await this.db.insert(schema.siteRevision).values({
        id: revisionId,
        siteId: params.siteId,
        data,
        meta: { ...(data?.meta ?? {}), mode: params.mode ?? 'draft' },
        createdAt: now,
      });
    }

    // queued
    await this.db.insert(schema.siteBuild).values({
      id: buildId,
      siteId: params.siteId,
      revisionId,
      status: 'queued',
      createdAt: now,
    });

    // running
    await this.db
      .update(schema.siteBuild)
      .set({ status: 'running' })
      .where(eq(schema.siteBuild.id, buildId));

    // Папки для рабочей сборки и артефактов
    const workingDir = path.join(process.cwd(), '.astro-builds', params.siteId, buildId);
    const artifactsDir = path.join(process.cwd(), 'artifacts', params.siteId);
    await fs.mkdir(workingDir, { recursive: true });
    await fs.mkdir(artifactsDir, { recursive: true });

    // Попытаться собрать через Astro (можно отключить через ASTRO_BUILD_ENABLED=false)
    let artifactFile = path.join(artifactsDir, `${buildId}.zip`);
    let artifactUrl = `file://${artifactFile}`;
    let metadataFile = path.join(artifactsDir, `${buildId}.json`);
    let logUrl = `file://${metadataFile}`;
    const metadata = {
      buildId,
      siteId: params.siteId,
      tenantId: params.tenantId,
      revisionId: '',
      mode: params.mode ?? 'draft',
      createdAt: now.toISOString(),
      artifactFile: artifactFile,
      artifactUrl: artifactUrl,
      s3: null as null | { bucket: string; key: string },
    };
    const astroEnabled = (process.env.ASTRO_BUILD_ENABLED ?? 'true').toLowerCase() !== 'false';
    try {
      if (astroEnabled) {
        const astroResult = await buildWithAstro({
          workingDir,
          outDir: artifactsDir,
          outFileName: `${buildId}.zip`,
          // Для Astro потребуются данные; если брали ревизию, можно вычитать её
          data: (await this.db
            .select({ data: schema.siteRevision.data, meta: schema.siteRevision.meta })
            .from(schema.siteRevision)
            .where(eq(schema.siteRevision.id, revisionId))
            .then((r) => ({ ...(r[0]?.data ?? {}), meta: r[0]?.meta ?? {} }))) as any,
          theme: (siteRow?.theme as any)?.template ?? 'default',
        });
        if (astroResult.ok && astroResult.artifactPath) {
          artifactFile = astroResult.artifactPath;
          artifactUrl = `file://${artifactFile}`;
          metadata.artifactFile = artifactFile;
          metadata.artifactUrl = artifactUrl;
        } else {
          this.logger.warn(`Astro build failed, fallback to stub: ${astroResult.error ?? ''}`);
          await fs.writeFile(
            artifactFile,
            JSON.stringify({ buildId, siteId: params.siteId, mode: params.mode ?? 'draft' }, null, 2),
          );
        }
      } else {
        await fs.writeFile(
          artifactFile,
          JSON.stringify({ buildId, siteId: params.siteId, mode: params.mode ?? 'draft' }, null, 2),
        );
      }
    } finally {
      // Очистка рабочей директории (best-effort)
      try {
        await fs.rm(workingDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }

    // Если настроен S3/Minio — загрузить артефакт и сохранить URL/ключи
    try {
      // Обновляем metadata перед выгрузкой
      metadata.revisionId = revisionId!;
      await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2), 'utf8');

      if (await this.s3.isEnabled()) {
        const bucket = await this.s3.ensureBucket();
        const prefix = `sites/${params.tenantId}/${params.siteId}/`;
        const artifactKey = `${prefix}${buildId}.zip`;
        const metadataKey = `${prefix}${buildId}.json`;

        const uploadedUrl = await this.s3.uploadFile(bucket, artifactKey, artifactFile);
        const metaUrl = await this.s3.uploadFile(bucket, metadataKey, metadataFile).catch(() => null);
        artifactUrl = uploadedUrl ?? artifactUrl;
        logUrl = metaUrl ?? logUrl;
        metadata.s3 = { bucket, key: artifactKey };
        metadata.artifactUrl = artifactUrl;
        await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2), 'utf8');

        await this.db
          .update(schema.siteBuild)
          .set({ s3Bucket: bucket, s3KeyPrefix: prefix, logUrl })
          .where(eq(schema.siteBuild.id, buildId));
      }
    } catch (e) {
      this.logger.warn(`S3 upload skipped/failed: ${e instanceof Error ? e.message : e}`);
    }

    // uploaded
    await this.db
      .update(schema.siteBuild)
      .set({ status: 'uploaded', artifactUrl, logUrl, completedAt: new Date() })
      .where(eq(schema.siteBuild.id, buildId));

    this.logger.log(`Generated build ${buildId} for site ${params.siteId} (artifact: ${artifactUrl})`);
    // Неблокирующая очистка старых локальных артефактов
    void this.cleanupOldArtifacts(artifactsDir).catch(() => undefined);
    return { buildId, revisionId: revisionId!, artifactUrl };
  }

  private async cleanupOldArtifacts(dir: string) {
    const days = Number.parseInt(String(process.env.ARTIFACT_RETENTION_DAYS ?? 14), 10);
    if (!Number.isFinite(days) || days <= 0) return;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      await Promise.all(
        entries
          .filter((e) => e.isFile() && (e.name.endsWith('.zip') || e.name.endsWith('.json')))
          .map(async (e) => {
            const p = path.join(dir, e.name);
            try {
              const st = await fs.stat(p);
              if (st.mtimeMs < cutoff) {
                await fs.rm(p, { force: true });
              }
            } catch {}
          }),
      );
    } catch {}
  }
}

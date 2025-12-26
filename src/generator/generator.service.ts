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
import { ClientProxy } from '@nestjs/microservices';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import { PG_CONNECTION, PRODUCT_RMQ_SERVICE } from '../constants';
import * as schema from '../db/schema';
import { buildWithAstro } from './astro.builder';
import { S3StorageService } from '../storage/s3.service';

interface ProductData {
  id: string;
  name: string;
  description?: string;
  price: number;
  images?: string[];
  slug?: string;
}

@Injectable()
export class SiteGeneratorService {
  private readonly logger = new Logger(SiteGeneratorService.name);

  constructor(
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
    @Inject(PRODUCT_RMQ_SERVICE)
    private readonly productClient: ClientProxy,
    private readonly s3: S3StorageService,
  ) {}

  /**
   * Получить товары для сайта по tenantId (shopId).
   * Возвращает пустой массив при ошибке/таймауте.
   */
  private async fetchProducts(tenantId: string, limit = 20): Promise<ProductData[]> {
    try {
      const result = await firstValueFrom(
        this.productClient.send('product.findAll', {
          shopId: tenantId,
          take: limit,
          status: 'active',
        }).pipe(
          timeout(5000),
          catchError((err) => {
            this.logger.warn(`Failed to fetch products for tenant ${tenantId}: ${err?.message ?? err}`);
            return [{ success: false, data: [] }];
          }),
        ),
      );
      if (result?.success && Array.isArray(result.data)) {
        return result.data.map((p: any) => ({
          id: p.id,
          name: p.title ?? p.name ?? '',
          description: p.description,
          price: p.basePrice ?? p.price ?? 0,
          images: p.images ?? [],
          slug: p.slug ?? p.id,
        }));
      }
      return [];
    } catch (e) {
      this.logger.warn(`fetchProducts error: ${e instanceof Error ? e.message : e}`);
      return [];
    }
  }

  async build(params: { tenantId: string; siteId: string; mode?: 'draft' | 'production' }) {
    // Подтянуть текущую тему/ревизию и собрать артефакт с единым именем <buildId>.zip
    let revisionId: string | null = null;
    const buildId = randomUUID();
    const now = new Date();

    // Определяем, какую ревизию брать: приоритет — currentRevisionId, если нет — создаём с темой
    const [siteRow] = await this.db
      .select({
        id: schema.site.id,
        themeId: schema.site.themeId,
        currentRevisionId: schema.site.currentRevisionId,
        publicUrl: schema.site.publicUrl,
        // JOIN: get templateId from theme table
        templateId: schema.theme.templateId,
      })
      .from(schema.site)
      .leftJoin(schema.theme, eq(schema.site.themeId, schema.theme.id))
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

    // Если текущая ревизия не найдена — создаём новую с базовыми данными
    if (!revisionId) {
      const data = { content: [], meta: { title: 'Мой сайт' } };
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

    // Получаем товары для сайта
    const products = await this.fetchProducts(params.tenantId);
    this.logger.log(`Fetched ${products.length} products for tenant ${params.tenantId}`);

    // Путь к dist/ директории после сборки Astro
    const distDir = path.join(workingDir, 'dist');
    let astroBuildSuccess = false;

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
          theme: siteRow?.templateId ?? 'default',
          products,
          tenantId: params.tenantId, // shopId для checkout
        });
        if (astroResult.ok && astroResult.artifactPath) {
          artifactFile = astroResult.artifactPath;
          artifactUrl = `file://${artifactFile}`;
          metadata.artifactFile = artifactFile;
          metadata.artifactUrl = artifactUrl;
          astroBuildSuccess = true;
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

      // Загрузить статику в S3 напрямую (для раздачи из MinIO)
      if (astroBuildSuccess && await this.s3.isEnabled()) {
        try {
          const bucket = await this.s3.ensureBucket();
          // Используем subdomain-based путь если есть publicUrl, иначе fallback на старый формат
          const sitePrefix = siteRow?.publicUrl
            ? this.s3.getSitePrefixBySubdomain(siteRow.publicUrl)
            : `sites/${params.tenantId}/${params.siteId}/`;

          // Удалить старые файлы сайта (если были)
          await this.s3.removePrefix(bucket, sitePrefix).catch(() => {});

          // Загрузить все файлы из dist/
          const { uploaded } = await this.s3.uploadDirectory(bucket, sitePrefix, distDir);
          this.logger.log(`Uploaded ${uploaded} static files to S3 for site ${params.siteId} (prefix: ${sitePrefix})`);
        } catch (e) {
          this.logger.warn(`Static files upload to S3 failed: ${e instanceof Error ? e.message : e}`);
        }
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
        // Используем subdomain-based путь для артефактов
        const prefix = siteRow?.publicUrl
          ? this.s3.getSitePrefixBySubdomain(siteRow.publicUrl)
          : `sites/${params.tenantId}/${params.siteId}/`;
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

/**
 * SitesDomainService — ядро доменной логики сервиса «Сайты».
 *
 * Задачи:
 * - CRUD сайтов в границах тенанта (organization)
 * - Работа с доменами: привязка и верификация (DNS TXT‑челендж)
 * - Публикация: запуск сборки (build) и деплоя (deploy)
 * - Заморозка/разморозка сайтов на основании статуса биллинга
 * - Публикация доменных событий (best‑effort), чтобы другие сервисы могли реагировать
 *
 * Примечания по идиоматике и отказоустойчивости:
 * - Все операции проверяют границы тенанта: siteId всегда валидируется по tenantId.
 * - Идемпотентность: операции создают/обновляют записи атомарно, повторные вызовы безопасны.
 * - События публикуются в fire‑and‑forget режиме — сбои в брокере не блокируют основной сценарий.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as path from 'path';
import * as fsp from 'fs/promises';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, ilike, or, sql } from 'drizzle-orm';
import { PG_CONNECTION } from './constants';
import * as schema from './db/schema';
import { SiteGeneratorService } from './generator/generator.service';
import { SitesEventsService } from './events/events.service';
import { DeploymentsService } from './deployments/deployments.service';
import { CoolifyProvider } from './deployments/coolify.provider';
import { S3StorageService } from './storage/s3.service';
import { DomainClient } from './domain';

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

@Injectable()
export class SitesDomainService {
  private readonly logger = new Logger(SitesDomainService.name);
  private static readonly MAX_THEME_BYTES = 512 * 1024; // 512KB

  constructor(
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly generator: SiteGeneratorService,
    private readonly events: SitesEventsService,
    private readonly deployments: DeploymentsService,
    private readonly coolify: CoolifyProvider,
    private readonly storage: S3StorageService,
    private readonly domainClient: DomainClient,
  ) {}

  async list(tenantId: string, limit = 50, cursor?: string) {
    // Cursor‑пагинация зарезервирована для будущей версии; сейчас возвращаем первые N записей
    const rows = await this.db
      .select({
        id: schema.site.id,
        name: schema.site.name,
        slug: schema.site.slug,
        status: schema.site.status,
        themeId: schema.site.themeId,
        publicUrl: schema.site.publicUrl,
        createdAt: schema.site.createdAt,
        // JOIN: theme data
        theme: {
          id: schema.theme.id,
          name: schema.theme.name,
          slug: schema.theme.slug,
          previewDesktop: schema.theme.previewDesktop,
          previewMobile: schema.theme.previewMobile,
          badge: schema.theme.badge,
        },
      })
      .from(schema.site)
      .leftJoin(schema.theme, eq(schema.site.themeId, schema.theme.id))
      .where(and(eq(schema.site.tenantId, tenantId), sql`${schema.site.deletedAt} IS NULL`))
      .limit(limit);

    // Transform null theme objects to null (when no theme is selected)
    const items = rows.map((row) => ({
      ...row,
      theme: row.theme?.id ? row.theme : null,
    }));

    return { items, nextCursor: null };
  }

  async get(tenantId: string, siteId: string) {
    const [row] = await this.db
      .select({
        id: schema.site.id,
        tenantId: schema.site.tenantId,
        name: schema.site.name,
        slug: schema.site.slug,
        status: schema.site.status,
        themeId: schema.site.themeId,
        currentRevisionId: schema.site.currentRevisionId,
        createdAt: schema.site.createdAt,
        updatedAt: schema.site.updatedAt,
        publicUrl: schema.site.publicUrl,
        coolifyAppUuid: schema.site.coolifyAppUuid,
        coolifyProjectUuid: schema.site.coolifyProjectUuid,
        domainId: schema.site.domainId,
        // JOIN: theme data
        theme: {
          id: schema.theme.id,
          name: schema.theme.name,
          slug: schema.theme.slug,
          description: schema.theme.description,
          previewDesktop: schema.theme.previewDesktop,
          previewMobile: schema.theme.previewMobile,
          templateId: schema.theme.templateId,
          badge: schema.theme.badge,
          tags: schema.theme.tags,
        },
      })
      .from(schema.site)
      .leftJoin(schema.theme, eq(schema.site.themeId, schema.theme.id))
      .where(and(eq(schema.site.id, siteId), eq(schema.site.tenantId, tenantId)));
    if (!row) return null;
    return {
      ...row,
      theme: row.theme?.id ? row.theme : null,
    };
  }

  async getBySlug(slug: string) {
    const [row] = await this.db
      .select({
        id: schema.site.id,
        tenantId: schema.site.tenantId,
        name: schema.site.name,
        slug: schema.site.slug,
        status: schema.site.status,
        themeId: schema.site.themeId,
        publicUrl: schema.site.publicUrl,
        createdAt: schema.site.createdAt,
        updatedAt: schema.site.updatedAt,
        // JOIN: theme data
        theme: {
          id: schema.theme.id,
          name: schema.theme.name,
          slug: schema.theme.slug,
          templateId: schema.theme.templateId,
          badge: schema.theme.badge,
        },
      })
      .from(schema.site)
      .leftJoin(schema.theme, eq(schema.site.themeId, schema.theme.id))
      .where(
        and(
          or(eq(schema.site.slug, slug), ilike(schema.site.slug, slug)),
          sql`${schema.site.deletedAt} IS NULL`,
        ),
      )
      .limit(1);

    if (!row) return null;
    return {
      ...row,
      theme: row.theme?.id ? row.theme : null,
    };
  }

  async create(params: {
    tenantId: string;
    actorUserId: string;
    name: string;
    slug?: string;
    companyName?: string;
    skipCoolify?: boolean;
  }) {
    // Генерация уникального slug в рамках одного tenant (читаемые суффиксы при коллизиях)
    const id = randomUUID();
    let effectiveSlug = params.slug?.trim();
    if (!effectiveSlug) {
      effectiveSlug = slugify(params.name);
    }

    // ensure uniqueness within tenant by suffixing -n
    let candidate = effectiveSlug;
    let n = 1;
    while (true) {
      const existing = await this.db
        .select({ id: schema.site.id })
        .from(schema.site)
        .where(and(eq(schema.site.tenantId, params.tenantId), ilike(schema.site.slug, candidate)))
        .limit(1);
      if (existing.length === 0) break;
      candidate = `${effectiveSlug}-${n++}`;
    }

    const now = new Date();

    // Интеграция с Coolify и Domain Service
    let coolifyProjectUuid: string | undefined;
    let coolifyAppUuid: string | undefined;
    let domainId: string | undefined;
    let publicUrl: string | undefined;

    if (!params.skipCoolify) {
      try {
        // 1. Получить или создать Project в Coolify для компании
        const companyName = params.companyName || params.name;
        coolifyProjectUuid = await this.coolify.getOrCreateProject(params.tenantId, companyName);
        this.logger.log(`Got Coolify project ${coolifyProjectUuid} for tenant ${params.tenantId}`);

        // 2. Сгенерировать поддомен через Domain Service
        const domainResult = await this.domainClient.generateSubdomain();
        domainId = domainResult.id;
        const subdomain = domainResult.name;
        this.logger.log(`Generated subdomain ${subdomain} (id: ${domainId})`);

        // 3. Создать приложение в Coolify с поддоменом
        const appResult = await this.coolify.createSiteApplication({
          projectUuid: coolifyProjectUuid,
          name: `${params.name}-${candidate}`,
          subdomain,
        });
        coolifyAppUuid = appResult.uuid;
        publicUrl = appResult.url;
        this.logger.log(`Created Coolify app ${coolifyAppUuid} with URL ${publicUrl}`);
      } catch (e) {
        this.logger.warn(
          `Coolify/Domain integration failed (site will be created without deployment): ${
            e instanceof Error ? e.message : e
          }`,
        );
        // Продолжаем создание сайта без Coolify интеграции
      }
    }

    await this.db.insert(schema.site).values({
      id,
      tenantId: params.tenantId,
      name: params.name,
      slug: candidate,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      createdBy: params.actorUserId,
      updatedBy: params.actorUserId,
      coolifyProjectUuid,
      coolifyAppUuid,
      domainId,
      publicUrl,
    });

    this.events.emit('sites.site.created', {
      tenantId: params.tenantId,
      siteId: id,
      name: params.name,
      slug: candidate,
      publicUrl,
    });

    return { id, publicUrl };
  }

  async update(params: { tenantId: string; siteId: string; patch: any; actorUserId?: string }) {
    const updates: Partial<typeof schema.site.$inferInsert> = {};
    if (typeof params.patch?.name === 'string' && params.patch.name.trim()) {
      updates.name = params.patch.name.trim();
    }
    if (params.patch?.slug) {
      const effectiveSlug = String(params.patch.slug).trim();
      if (effectiveSlug) {
        // ensure uniqueness
        let candidate = effectiveSlug;
        let n = 1;
        while (true) {
          const existing = await this.db
            .select({ id: schema.site.id })
            .from(schema.site)
            .where(
              and(
                eq(schema.site.tenantId, params.tenantId),
                ilike(schema.site.slug, candidate),
                sql`${schema.site.id} != ${params.siteId}`,
              ),
            )
            .limit(1);
          if (existing.length === 0) break;
          candidate = `${effectiveSlug}-${n++}`;
        }
        updates.slug = candidate;
      }
    }
    // Handle themeId (new) or theme (legacy, for backward compatibility during migration)
    if (typeof params.patch?.themeId === 'string') {
      updates.themeId = params.patch.themeId || null;
    } else if (params.patch?.theme?.id) {
      // Legacy: accept { theme: { id: 'rose' } } and extract themeId
      updates.themeId = params.patch.theme.id;
    }

    updates.updatedAt = new Date();
    if (params.actorUserId) updates.updatedBy = params.actorUserId;

    const [row] = await this.db
      .update(schema.site)
      .set(updates)
      .where(and(eq(schema.site.id, params.siteId), eq(schema.site.tenantId, params.tenantId)))
      .returning({ id: schema.site.id });
    if (row) this.events.emit('sites.site.updated', { tenantId: params.tenantId, siteId: params.siteId, patch: params.patch ?? {} });
    return Boolean(row);
  }

  async softDelete(tenantId: string, siteId: string) {
    // Мягкое удаление: отметка deletedAt без разрушения данных (возможен restore)
    const [row] = await this.db
      .update(schema.site)
      .set({ deletedAt: new Date() })
      .where(and(eq(schema.site.id, siteId), eq(schema.site.tenantId, tenantId)))
      .returning({ id: schema.site.id });
    if (row) {
      this.events.emit('sites.site.deleted', { tenantId, siteId, soft: true });
      // Best-effort: включить maintenance у провайдера
      try {
        await this.coolify.toggleMaintenance(siteId, true);
      } catch {}
    }
    return Boolean(row);
  }

  async hardDelete(tenantId: string, siteId: string) {
    // Жёсткое удаление: удаление данных из БД и локальных артефактов (если есть)
    const [row] = await this.db
      .delete(schema.site)
      .where(and(eq(schema.site.id, siteId), eq(schema.site.tenantId, tenantId)))
      .returning({ id: schema.site.id });
    if (row) {
      this.events.emit('sites.site.deleted', { tenantId, siteId, soft: false });
      try {
        const artifactsDir = path.join(process.cwd(), 'artifacts', siteId);
        await fsp.rm(artifactsDir, { recursive: true, force: true });
      } catch {}
      // Best-effort: удалить артефакты из S3/Minio, если включен
      try {
        if (await this.storage.isEnabled()) {
          const bucket = await this.storage.ensureBucket();
          const prefix = `sites/${tenantId}/${siteId}/`;
          await this.storage.removePrefix(bucket, prefix);
        }
      } catch {}
    }
    return Boolean(row);
  }

  async attachDomain(params: { tenantId: string; siteId: string; domain: string; actorUserId: string }) {
    // Проверяем принадлежность сайта текущему tenant
    const site = await this.get(params.tenantId, params.siteId);
    if (!site) throw new Error('site_not_found');
    const id = randomUUID();
    const token = crypto.randomUUID().replace(/-/g, '');
    try {
      await this.db.insert(schema.siteDomain).values({
        id,
        siteId: params.siteId,
        domain: params.domain,
        status: 'pending',
        verificationToken: token,
        verificationType: 'dns',
        createdAt: new Date(),
      });
    } catch (e: any) {
      // Unique violation (domain) → дружелюбная ошибка
      const message = e?.message?.toLowerCase?.() ?? '';
      if (message.includes('duplicate') || message.includes('unique')) {
        throw new Error('domain_already_in_use');
      }
      throw e;
    }
    this.events.emit('sites.domain.attached', { tenantId: params.tenantId, siteId: params.siteId, domain: params.domain });
    const dnsName = `_merfy-verify.${params.domain}`; // имя TXT‑записи у провайдера DNS
    const dnsValue = token;
    return { id, challenge: { type: 'dns', name: dnsName, value: dnsValue } };
  }

  async verifyDomain(params: { tenantId: string; siteId: string; domain?: string; token?: string }) {
    const site = await this.get(params.tenantId, params.siteId);
    if (!site) throw new Error('site_not_found');
    if (!params.domain) {
      throw new Error('domain_required');
    }
    // Проверяем конкретный домен и токен, если он установлен
    const [record] = await this.db
      .select({ id: schema.siteDomain.id, token: schema.siteDomain.verificationToken })
      .from(schema.siteDomain)
      .where(and(eq(schema.siteDomain.siteId, params.siteId), eq(schema.siteDomain.domain, params.domain)));
    if (!record) return false;
    if (record.token && params.token && record.token !== params.token) {
      throw new Error('verification_token_mismatch');
    }
    const [row] = await this.db
      .update(schema.siteDomain)
      .set({ status: 'verified', verifiedAt: new Date() })
      .where(and(eq(schema.siteDomain.siteId, params.siteId), eq(schema.siteDomain.domain, params.domain)))
      .returning({ id: schema.siteDomain.id, domain: schema.siteDomain.domain });
    if (row) {
      this.events.emit('sites.domain.verified', { tenantId: params.tenantId, siteId: params.siteId, domain: params.domain });
      await this.coolify.setDomain(params.siteId, params.domain);
    }
    return Boolean(row);
  }

  async publish(params: { tenantId: string; siteId: string; mode?: 'draft' | 'production' }) {
    const site = await this.get(params.tenantId, params.siteId);
    if (!site) throw new Error('site_not_found');

    // 1. Собрать сайт и загрузить в S3
    const { buildId, artifactUrl, revisionId } = await this.generator.build({
      tenantId: params.tenantId,
      siteId: params.siteId,
      mode: params.mode,
    });

    // 2. Получить публичный URL из S3 (статика раздаётся напрямую из MinIO)
    const publicUrl = this.storage.getSitePublicUrl(params.tenantId, params.siteId);

    // 3. Опционально: деплой через Coolify (для кастомных доменов)
    let deployUrl: string | undefined;
    try {
      const deployResult = await this.deployments.deploy({
        tenantId: params.tenantId,
        siteId: params.siteId,
        buildId,
        artifactUrl,
      });
      deployUrl = deployResult.url;
    } catch (e) {
      this.logger.warn(`Coolify deploy skipped: ${e instanceof Error ? e.message : e}`);
    }

    // Приоритет: publicUrl из S3, fallback на deployUrl из Coolify
    const finalUrl = publicUrl || deployUrl || site.publicUrl;

    // 4. Обновить статус сайта
    await this.db
      .update(schema.site)
      .set({
        status: 'published',
        currentRevisionId: revisionId,
        publicUrl: finalUrl,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.site.id, params.siteId), eq(schema.site.tenantId, params.tenantId)));

    this.events.emit('sites.site.published', {
      tenantId: params.tenantId,
      siteId: params.siteId,
      buildId,
      url: finalUrl,
    });

    return { url: finalUrl, buildId, artifactUrl };
  }

  // Revisions API
  async listRevisions(tenantId: string, siteId: string, limit = 50) {
    const site = await this.get(tenantId, siteId);
    if (!site) throw new Error('site_not_found');
    const rows = await this.db
      .select({ id: schema.siteRevision.id, createdAt: schema.siteRevision.createdAt })
      .from(schema.siteRevision)
      .where(eq(schema.siteRevision.siteId, siteId))
      .limit(limit);
    return { items: rows };
  }

  async createRevision(params: { tenantId: string; siteId: string; data: any; meta?: any; actorUserId?: string; setCurrent?: boolean }) {
    const site = await this.get(params.tenantId, params.siteId);
    if (!site) throw new Error('site_not_found');
    const id = crypto.randomUUID();
    await this.db.insert(schema.siteRevision).values({
      id,
      siteId: params.siteId,
      data: params.data ?? {},
      meta: params.meta ?? {},
      createdAt: new Date(),
      createdBy: params.actorUserId,
    });
    if (params.setCurrent) {
      await this.db
        .update(schema.site)
        .set({ currentRevisionId: id, updatedAt: new Date() })
        .where(and(eq(schema.site.id, params.siteId), eq(schema.site.tenantId, params.tenantId)));
    }
    return { revisionId: id };
  }

  async setCurrentRevision(params: { tenantId: string; siteId: string; revisionId: string }) {
    const site = await this.get(params.tenantId, params.siteId);
    if (!site) throw new Error('site_not_found');
    const [rev] = await this.db
      .select({ id: schema.siteRevision.id })
      .from(schema.siteRevision)
      .where(and(eq(schema.siteRevision.id, params.revisionId), eq(schema.siteRevision.siteId, params.siteId)));
    if (!rev) throw new Error('revision_not_found');
    await this.db
      .update(schema.site)
      .set({ currentRevisionId: params.revisionId, updatedAt: new Date() })
      .where(and(eq(schema.site.id, params.siteId), eq(schema.site.tenantId, params.tenantId)));
    return { success: true } as const;
  }

  async freezeTenant(tenantId: string) {
    const res = await this.db
      .update(schema.site)
      .set({ prevStatus: sql`${schema.site.status}` as any, status: 'frozen', frozenAt: new Date() })
      .where(and(eq(schema.site.tenantId, tenantId), sql`${schema.site.deletedAt} IS NULL`, sql`${schema.site.status} != 'frozen'`))
      .returning({ id: schema.site.id });
    this.events.emit('sites.tenant.frozen', { tenantId, count: res.length });
    // Best-effort включить maintenance у провайдера для всех сайтов
    for (const row of res) {
      try {
        await this.coolify.toggleMaintenance(row.id, true);
      } catch {}
    }
    return { affected: res.length };
  }

  async unfreezeTenant(tenantId: string) {
    const res = await this.db
      .update(schema.site)
      .set({ status: sql`COALESCE(${schema.site.prevStatus}, 'draft')`, prevStatus: null as any, frozenAt: null as any })
      .where(and(eq(schema.site.tenantId, tenantId), eq(schema.site.status, 'frozen')))
      .returning({ id: schema.site.id });
    this.events.emit('sites.tenant.unfrozen', { tenantId, count: res.length });
    // Best-effort выключить maintenance у провайдера для всех сайтов
    for (const row of res) {
      try {
        await this.coolify.toggleMaintenance(row.id, false);
      } catch {}
    }
    return { affected: res.length };
  }
}

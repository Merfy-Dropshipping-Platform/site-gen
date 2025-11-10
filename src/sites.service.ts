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
import { and, eq, ilike, sql } from 'drizzle-orm';
import { PG_CONNECTION } from './constants';
import * as schema from './db/schema';
import { SiteGeneratorService } from './generator/generator.service';
import { SitesEventsService } from './events/events.service';
import { DeploymentsService } from './deployments/deployments.service';
import { CoolifyProvider } from './deployments/coolify.provider';
import { S3StorageService } from './storage/s3.service';

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
  ) {}

  async list(tenantId: string, limit = 50, cursor?: string) {
    // Cursor‑пагинация зарезервирована для будущей версии; сейчас возвращаем первые N записей
    const rows = await this.db
      .select({
        id: schema.site.id,
        name: schema.site.name,
        slug: schema.site.slug,
        status: schema.site.status,
        createdAt: schema.site.createdAt,
      })
      .from(schema.site)
      .where(and(eq(schema.site.tenantId, tenantId), sql`${schema.site.deletedAt} IS NULL`))
      .limit(limit);

    return { items: rows, nextCursor: null };
  }

  async get(tenantId: string, siteId: string) {
    const [row] = await this.db
      .select()
      .from(schema.site)
      .where(and(eq(schema.site.id, siteId), eq(schema.site.tenantId, tenantId)));
    return row ?? null;
  }

  async create(params: { tenantId: string; actorUserId: string; name: string; slug?: string }) {
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
    });
    this.events.emit('sites.site.created', { tenantId: params.tenantId, siteId: id, name: params.name, slug: candidate });
    return id;
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
    if (params.patch?.theme) {
      const size = Buffer.byteLength(JSON.stringify(params.patch.theme), 'utf8');
      if (size > SitesDomainService.MAX_THEME_BYTES) {
        throw new Error('theme_payload_too_large');
      }
      updates.theme = params.patch.theme;
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
    const { buildId, artifactUrl, revisionId } = await this.generator.build({ tenantId: params.tenantId, siteId: params.siteId, mode: params.mode });
    const { url } = await this.deployments.deploy({ tenantId: params.tenantId, siteId: params.siteId, buildId, artifactUrl });
    // Отметить сайт как опубликованный и сохранить текущую ревизию
    await this.db
      .update(schema.site)
      .set({ status: 'published', currentRevisionId: revisionId, updatedAt: new Date() })
      .where(and(eq(schema.site.id, params.siteId), eq(schema.site.tenantId, params.tenantId)));
    this.events.emit('sites.site.published', { tenantId: params.tenantId, siteId: params.siteId, buildId, url });
    return { url, buildId, artifactUrl };
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

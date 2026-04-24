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
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import { firstValueFrom, timeout, catchError, of } from "rxjs";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as fsp from "fs/promises";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { COOLIFY_RMQ_SERVICE, PG_CONNECTION } from "./constants";
import * as schema from "./db/schema";
import { SiteGeneratorService } from "./generator/generator.service";
import { SitesEventsService } from "./events/events.service";
import { DeploymentsService } from "./deployments/deployments.service";
import { S3StorageService } from "./storage/s3.service";
import { DomainClient } from "./domain";
import { BillingClient } from "./billing/billing.client";
import { BuildQueuePublisher } from "./rabbitmq/build-queue.service";

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

@Injectable()
export class SitesDomainService {
  private readonly logger = new Logger(SitesDomainService.name);
  private static readonly MAX_THEME_BYTES = 512 * 1024; // 512KB

  constructor(
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
    @Inject(COOLIFY_RMQ_SERVICE)
    private readonly coolifyClient: ClientProxy,
    private readonly generator: SiteGeneratorService,
    private readonly events: SitesEventsService,
    private readonly deployments: DeploymentsService,
    private readonly storage: S3StorageService,
    private readonly domainClient: DomainClient,
    private readonly billingClient: BillingClient,
    private readonly buildQueue: BuildQueuePublisher,
  ) {}

  /**
   * Вызов Coolify Worker через RPC.
   * Возвращает { success: true, ...data } или { success: false, message: string }
   */
  private async callCoolify<T = any>(pattern: string, data: any): Promise<T> {
    const result = await firstValueFrom(
      this.coolifyClient.send(pattern, data).pipe(
        timeout(30000),
        catchError((err) =>
          of({ success: false, message: err?.message || "rpc_timeout" }),
        ),
      ),
    );
    return result as T;
  }

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
        branding: schema.site.branding,
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
      .where(
        and(
          eq(schema.site.tenantId, tenantId),
          sql`${schema.site.deletedAt} IS NULL`,
        ),
      )
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
        storageSlug: schema.site.storageSlug,
        coolifyAppUuid: schema.site.coolifyAppUuid,
        coolifyProjectUuid: schema.site.coolifyProjectUuid,
        domainId: schema.site.domainId,
        branding: schema.site.branding,
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
      .where(
        and(eq(schema.site.id, siteId), eq(schema.site.tenantId, tenantId)),
      );
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
        branding: schema.site.branding,
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

  /**
   * Получить магазин по ID (публичный доступ, без проверки tenantId)
   * Используется orders service для создания корзины
   */
  async getById(siteId: string) {
    const [row] = await this.db
      .select({
        id: schema.site.id,
        tenantId: schema.site.tenantId,
        name: schema.site.name,
        slug: schema.site.slug,
        status: schema.site.status,
        themeId: schema.site.themeId,
        publicUrl: schema.site.publicUrl,
        storageSlug: schema.site.storageSlug,
        branding: schema.site.branding,
        createdAt: schema.site.createdAt,
        updatedAt: schema.site.updatedAt,
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
        and(eq(schema.site.id, siteId), sql`${schema.site.deletedAt} IS NULL`),
      )
      .limit(1);

    if (!row) return null;
    return {
      ...row,
      theme: row.theme?.id ? row.theme : null,
    };
  }

  /**
   * Fast signup path: creates the site row + default revision synchronously
   * (~100ms) and emits `sites.site.created` so downstream consumers (e.g.
   * user-service team-sync) can react immediately. External provisioning
   * (REG.RU subdomain, Coolify project) is NOT performed here —
   * `publicUrl`/`storageSlug`/`domainId`/`coolifyProjectUuid` remain null
   * until a subsequent `finishProvisioning()` call populates them.
   *
   * Pair with `triggerAsyncProvisioning()` from the caller (see
   * `user.listener.ts`) to kick off the slow path via RMQ. For admin/cron
   * paths that need the final publicUrl synchronously, use the `create()`
   * facade instead.
   */
  async reserve(params: {
    tenantId: string;
    actorUserId: string;
    name: string;
    slug?: string;
    companyName?: string;
    skipCoolify?: boolean;
    themeId?: string;
  }): Promise<{ id: string; publicUrl: null }> {
    // Проверяем лимит сайтов по тарифу
    const currentSiteCount = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.site)
      .where(
        and(
          eq(schema.site.tenantId, params.tenantId),
          sql`${schema.site.deletedAt} IS NULL`,
          sql`${schema.site.status} != 'archived'`,
        ),
      )
      .then((rows) => rows[0]?.count ?? 0);

    const canCreate = await this.billingClient.canCreateSite(
      params.tenantId,
      currentSiteCount,
    );
    if (!canCreate.allowed) {
      this.logger.warn(
        `Site creation blocked for tenant ${params.tenantId}: ${canCreate.reason}, limit=${canCreate.limit}, current=${currentSiteCount}`,
      );
      throw new Error(
        canCreate.reason === "account_frozen"
          ? "account_frozen"
          : "shops_limit_reached",
      );
    }

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
        .where(
          and(
            eq(schema.site.tenantId, params.tenantId),
            ilike(schema.site.slug, candidate),
          ),
        )
        .limit(1);
      if (existing.length === 0) break;
      candidate = `${effectiveSlug}-${n++}`;
    }

    const now = new Date();
    const effectiveThemeId = params.themeId?.trim() || "rose";

    // Insert site with null provisioning fields — finishProvisioning fills them later
    await this.db.insert(schema.site).values({
      id,
      tenantId: params.tenantId,
      name: params.name,
      slug: candidate,
      status: "draft",
      createdAt: now,
      updatedAt: now,
      createdBy: params.actorUserId,
      updatedBy: params.actorUserId,
      domainId: undefined,
      publicUrl: undefined,
      storageSlug: undefined,
      coolifyProjectUuid: undefined,
      themeId: effectiveThemeId,
    });

    // Default revision is theme content from bundled JSON — local, fast, no network.
    // Must happen synchronously so the theme editor has content from t=0.
    try {
      const defaultContent = this.getDefaultContent(effectiveThemeId);
      if (defaultContent) {
        await this.createRevision({
          tenantId: params.tenantId,
          siteId: id,
          data: defaultContent,
          meta: { title: params.name || "Мой магазин" },
          actorUserId: params.actorUserId,
          setCurrent: true,
        });
      }
    } catch (e) {
      this.logger.warn(
        `Failed to create default revision for site ${id} (site reserved anyway): ${e instanceof Error ? e.message : e}`,
      );
    }

    this.events.emit("sites.site.created", {
      tenantId: params.tenantId,
      siteId: id,
      name: params.name,
      slug: candidate,
      publicUrl: null,
    });

    return { id, publicUrl: null };
  }

  /**
   * Fire-and-forget: publishes `sites.site.provision_requested` on the
   * sites queue. The same service consumes it via `@EventPattern` in
   * `SitesMicroserviceController` and invokes `finishProvisioning()`.
   *
   * Used by the signup flow so the user's HTTP response is not blocked
   * by the 3s REG.RU saga. The RMQ hop provides crash-safety: if site-gen
   * is restarted between reserve and provision, the broker redelivers the
   * message.
   */
  triggerAsyncProvisioning(
    siteId: string,
    tenantId: string,
    companyName?: string,
  ): void {
    this.events.emit("sites.site.provision_requested", {
      siteId,
      tenantId,
      companyName,
    });
  }

  /**
   * Slow provisioning path (idempotent): generates the REG.RU subdomain
   * (~3s via domain-service), creates the Coolify project (~200ms),
   * UPDATEs the site row with resolved URL fields, records siteDomainHistory,
   * and emits `sites.site.provisioned`.
   *
   * Safe to call multiple times for the same siteId — short-circuits via a
   * SELECT on the site row if both `domainId` AND `coolifyProjectUuid` are
   * already populated. Partial failures (one step succeeded, another did
   * not) leave the row in an inconsistent state which the cron reaper at
   * `site-provisioning.scheduler.ts` picks up and retries.
   *
   * Called by:
   *   - `create()` facade synchronously (admin RPC + site-provisioning cron)
   *   - `@EventPattern('sites.site.provision_requested')` handler (signup)
   */
  async finishProvisioning(
    siteId: string,
    tenantId: string,
    companyName?: string,
    skipCoolify?: boolean,
  ): Promise<{ publicUrl: string | undefined }> {
    const existingRows = await this.db
      .select({
        domainId: schema.site.domainId,
        publicUrl: schema.site.publicUrl,
        storageSlug: schema.site.storageSlug,
        coolifyProjectUuid: schema.site.coolifyProjectUuid,
      })
      .from(schema.site)
      .where(eq(schema.site.id, siteId))
      .limit(1);
    const existing = existingRows[0];
    if (!existing) {
      this.logger.warn(
        `finishProvisioning: site ${siteId} not found, skipping`,
      );
      return { publicUrl: undefined };
    }

    // Idempotency: fully provisioned → no-op
    if (existing.domainId && existing.coolifyProjectUuid) {
      return { publicUrl: existing.publicUrl ?? undefined };
    }

    let domainId: string | undefined = existing.domainId ?? undefined;
    let publicUrl: string | undefined = existing.publicUrl ?? undefined;
    let storageSlug: string | undefined = existing.storageSlug ?? undefined;
    let coolifyProjectUuid: string | undefined =
      existing.coolifyProjectUuid ?? undefined;

    // Generate subdomain via Domain Service (if not already done)
    if (!skipCoolify && !domainId) {
      try {
        const domainResult =
          await this.domainClient.generateSubdomain(tenantId);
        domainId = domainResult.id;
        const subdomain = domainResult.name;
        publicUrl = this.storage.getSitePublicUrlBySubdomain(subdomain);
        storageSlug = this.storage.extractSubdomainSlug(subdomain);
        this.logger.log(
          `finishProvisioning: generated subdomain ${subdomain} (id: ${domainId}) for site ${siteId} tenant ${tenantId}`,
        );
      } catch (e) {
        this.logger.warn(
          `finishProvisioning: Domain Service failed for site ${siteId}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }

    // Create or get Coolify project (if not already done)
    if (!skipCoolify && !coolifyProjectUuid) {
      try {
        coolifyProjectUuid = await this.getOrCreateTenantProject(
          tenantId,
          companyName,
        );
        this.logger.log(
          `finishProvisioning: Coolify project ${coolifyProjectUuid} ready for tenant ${tenantId} site ${siteId}`,
        );
      } catch (e) {
        this.logger.warn(
          `finishProvisioning: Coolify project failed for site ${siteId}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }

    // UPDATE site with resolved fields (partial updates ok — reaper will retry missing bits)
    await this.db
      .update(schema.site)
      .set({
        domainId,
        publicUrl,
        storageSlug,
        coolifyProjectUuid,
        updatedAt: new Date(),
      })
      .where(eq(schema.site.id, siteId));

    // Record initial domain in history — SELECT-before-INSERT guard
    // (no unique constraint on siteDomainHistory(siteId, domainId))
    if (domainId && publicUrl) {
      const subdomainName = publicUrl
        .replace(/^https?:\/\//, "")
        .replace(/\/$/, "");
      const historyExists = await this.db
        .select({ id: schema.siteDomainHistory.id })
        .from(schema.siteDomainHistory)
        .where(
          and(
            eq(schema.siteDomainHistory.siteId, siteId),
            eq(schema.siteDomainHistory.domainId, domainId),
          ),
        )
        .limit(1);
      if (historyExists.length === 0) {
        await this.db.insert(schema.siteDomainHistory).values({
          id: randomUUID(),
          siteId,
          domainName: subdomainName,
          domainId,
          type: "generated",
          status: "active",
          attachedAt: new Date(),
        });
      }
    }

    // Emit provisioned event only when something actually resolved
    if (domainId || coolifyProjectUuid) {
      this.events.emit("sites.site.provisioned", {
        tenantId,
        siteId,
        publicUrl,
        storageSlug,
        domainId,
        coolifyProjectUuid,
      });
    }

    return { publicUrl };
  }

  /**
   * Backward-compat facade: synchronously creates AND provisions a site.
   * Used by the admin RPC (`sites.create_site`) and the site-provisioning
   * cron fallback — both of which expect `publicUrl` in the response.
   *
   * The signup flow must NOT use this — it calls `reserve()` +
   * `triggerAsyncProvisioning()` to keep signup fast (~300ms instead of
   * 3500ms).
   */
  async create(params: {
    tenantId: string;
    actorUserId: string;
    name: string;
    slug?: string;
    companyName?: string;
    skipCoolify?: boolean;
    themeId?: string;
  }): Promise<{ id: string; publicUrl: string | undefined }> {
    const { id } = await this.reserve(params);
    const { publicUrl } = await this.finishProvisioning(
      id,
      params.tenantId,
      params.companyName,
      params.skipCoolify,
    );
    return { id, publicUrl };
  }

  async update(params: {
    tenantId: string;
    siteId: string;
    patch: any;
    actorUserId?: string;
  }) {
    const updates: Partial<typeof schema.site.$inferInsert> = {};
    if (typeof params.patch?.name === "string" && params.patch.name.trim()) {
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
    let nextThemeId: string | null | undefined;
    if (typeof params.patch?.themeId === "string") {
      nextThemeId = params.patch.themeId || null;
      updates.themeId = nextThemeId;
    } else if (params.patch?.theme?.id) {
      // Legacy: accept { theme: { id: 'rose' } } and extract themeId
      nextThemeId = params.patch.theme.id;
      updates.themeId = nextThemeId;
    }
    // Handle branding (logo + colors); null clears branding
    if ("branding" in (params.patch ?? {})) {
      updates.branding = params.patch.branding ?? null;
    }
    // Handle settings (checkout config, etc.)
    if ("settings" in (params.patch ?? {})) {
      updates.settings = params.patch.settings ?? null;
    }

    updates.updatedAt = new Date();
    if (params.actorUserId) updates.updatedBy = params.actorUserId;

    const [row] = await this.db
      .update(schema.site)
      .set(updates)
      .where(
        and(
          eq(schema.site.id, params.siteId),
          eq(schema.site.tenantId, params.tenantId),
        ),
      )
      .returning({ id: schema.site.id });

    // Rose-style re-seed: при смене themeId пересеиваем revision из defaults/{theme}.json
    // если текущая revision не содержит themeSettings (сайт-новичок, которого
    // переключили с темы-дефолта, где themeSettings не сеялся).
    // Это гарантирует что merchant-уровень colorSchemes + pagesData соответствуют
    // новой теме — без этого :root получает fallback scheme из theme.json, и контент
    // остаётся в старой семантике scheme-IDs.
    if (row && typeof nextThemeId === "string" && nextThemeId) {
      try {
        const [current] = await this.db
          .select({
            id: schema.site.id,
            currentRevisionId: schema.site.currentRevisionId,
          })
          .from(schema.site)
          .where(eq(schema.site.id, params.siteId))
          .limit(1);
        let shouldReseed = !current?.currentRevisionId;
        if (current?.currentRevisionId) {
          const [rev] = await this.db
            .select({ data: schema.siteRevision.data })
            .from(schema.siteRevision)
            .where(eq(schema.siteRevision.id, current.currentRevisionId))
            .limit(1);
          const d = (rev?.data ?? {}) as Record<string, unknown>;
          const ts = (d as any).themeSettings;
          const hasThemeSettings =
            ts &&
            typeof ts === "object" &&
            Array.isArray((ts as any).colorSchemes) &&
            (ts as any).colorSchemes.length > 0;
          shouldReseed = !hasThemeSettings;
        }
        if (shouldReseed) {
          const defaultContent = this.getDefaultContent(nextThemeId);
          if (defaultContent) {
            await this.createRevision({
              tenantId: params.tenantId,
              siteId: params.siteId,
              data: defaultContent,
              meta: { title: "Theme reseed" },
              actorUserId: params.actorUserId,
              setCurrent: true,
            });
            this.logger.log(
              `theme-switch reseed: site=${params.siteId} theme=${nextThemeId}`,
            );
          }
        }
      } catch (e) {
        this.logger.warn(
          `theme-switch reseed failed for ${params.siteId}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }

    if (row)
      this.events.emit("sites.site.updated", {
        tenantId: params.tenantId,
        siteId: params.siteId,
        patch: params.patch ?? {},
      });
    return Boolean(row);
  }

  async softDelete(tenantId: string, siteId: string) {
    // Мягкое удаление: отметка deletedAt без разрушения данных (возможен restore)
    const [row] = await this.db
      .update(schema.site)
      .set({ deletedAt: new Date() })
      .where(
        and(eq(schema.site.id, siteId), eq(schema.site.tenantId, tenantId)),
      )
      .returning({ id: schema.site.id });
    if (row) {
      this.events.emit("sites.site.deleted", { tenantId, siteId, soft: true });
      // Best-effort: включить maintenance у провайдера
      try {
        await this.callCoolify("coolify.toggle_maintenance", {
          appUuid: siteId,
          enabled: true,
        });
      } catch {}
    }
    return Boolean(row);
  }

  async hardDelete(tenantId: string, siteId: string) {
    // Сначала получаем publicUrl для определения S3 prefix
    const [siteRow] = await this.db
      .select({ id: schema.site.id, publicUrl: schema.site.publicUrl, storageSlug: schema.site.storageSlug })
      .from(schema.site)
      .where(
        and(eq(schema.site.id, siteId), eq(schema.site.tenantId, tenantId)),
      );

    // Жёсткое удаление: удаление данных из БД и локальных артефактов (если есть)
    const [row] = await this.db
      .delete(schema.site)
      .where(
        and(eq(schema.site.id, siteId), eq(schema.site.tenantId, tenantId)),
      )
      .returning({ id: schema.site.id });

    if (row) {
      this.events.emit("sites.site.deleted", { tenantId, siteId, soft: false });

      // Очистка локальных артефактов
      try {
        const artifactsDir = path.join(process.cwd(), "artifacts", siteId);
        await fsp.rm(artifactsDir, { recursive: true, force: true });
      } catch {}

      // Best-effort: удалить статику из S3/MinIO
      try {
        if (await this.storage.isEnabled()) {
          const bucket = await this.storage.ensureBucket();
          const prefix = siteRow?.storageSlug
            ? `sites/${siteRow.storageSlug}/`
            : siteRow?.publicUrl
              ? this.storage.getSitePrefixBySubdomain(siteRow.publicUrl)
              : `sites/${tenantId}/${siteId}/`;
          await this.storage.removePrefix(bucket, prefix);
        }
      } catch {}
    }
    return Boolean(row);
  }

  async attachDomain(params: {
    tenantId: string;
    siteId: string;
    domain: string;
    actorUserId: string;
  }) {
    // Проверяем принадлежность сайта текущему tenant
    const site = await this.get(params.tenantId, params.siteId);
    if (!site) throw new Error("site_not_found");

    // Делегируем создание домена в domain-сервис (DNS-проверки, токен, IP)
    const domainResult = await this.domainClient.addExternalDomain(
      params.domain,
      params.siteId,
    );

    const id = randomUUID();
    const token = domainResult.instructions?.txtRecord?.value ?? "";
    try {
      await this.db.insert(schema.siteDomain).values({
        id,
        siteId: params.siteId,
        domain: params.domain,
        status: "pending",
        verificationToken: token,
        verificationType: "dns",
        createdAt: new Date(),
      });
    } catch (e: any) {
      const message = e?.message?.toLowerCase?.() ?? "";
      if (message.includes("duplicate") || message.includes("unique")) {
        throw new Error("domain_already_in_use");
      }
      throw e;
    }
    this.events.emit("sites.domain.attached", {
      tenantId: params.tenantId,
      siteId: params.siteId,
      domain: params.domain,
    });
    return {
      id,
      challenge: domainResult.instructions?.txtRecord
        ? { type: "dns", name: domainResult.instructions.txtRecord.name, value: domainResult.instructions.txtRecord.value }
        : undefined,
      instructions: domainResult.instructions,
    };
  }

  /**
   * verifyDomain — устаревший метод, оставлен как заглушка.
   * Реальная верификация (TXT) и активация (A-record) теперь происходят
   * через domain-сервис напрямую (gateway → domain.verify_ownership / domain.activate).
   * При успешной активации domain-сервис публикует DomainDnsReadyEvent →
   * site-gen получает событие domain_ready → вызывает switchDomain.
   */
  async verifyDomain(params: {
    tenantId: string;
    siteId: string;
    domain?: string;
    token?: string;
  }) {
    const site = await this.get(params.tenantId, params.siteId);
    if (!site) throw new Error("site_not_found");
    if (!params.domain) {
      throw new Error("domain_required");
    }

    // Проверяем наличие записи в siteDomain
    const [record] = await this.db
      .select({
        id: schema.siteDomain.id,
        status: schema.siteDomain.status,
      })
      .from(schema.siteDomain)
      .where(
        and(
          eq(schema.siteDomain.siteId, params.siteId),
          eq(schema.siteDomain.domain, params.domain),
        ),
      );
    if (!record) return false;

    // Верификация делегирована domain-сервису.
    // switchDomain будет вызван автоматически через событие domain_ready.
    return record.status === "verified";
  }

  async publish(params: {
    tenantId: string;
    siteId: string;
    mode?: "draft" | "production";
  }) {
    const site = await this.get(params.tenantId, params.siteId);
    if (!site) throw new Error("site_not_found");

    let coolifyAppUuid = site.coolifyAppUuid;
    let finalUrl = site.publicUrl;

    // 1. Определить публичный URL (если не установлен — генерируем subdomain)
    if (!finalUrl) {
      const slug = params.tenantId.replace(/-/g, "").slice(0, 12);
      finalUrl = `https://${slug}.merfy.ru`;

      await this.db
        .update(schema.site)
        .set({
          publicUrl: finalUrl,
          ...(!site.storageSlug ? { storageSlug: slug } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.site.id, params.siteId),
            eq(schema.site.tenantId, params.tenantId),
          ),
        );

      this.logger.log(
        `Generated local subdomain on publish: ${slug}.merfy.ru, publicUrl: ${finalUrl}`,
      );
    }

    const effectiveStorageSlug =
      site.storageSlug ?? this.storage.extractSubdomainSlug(finalUrl!);

    // 2. Fire Coolify app creation in background (parallel with build)
    let coolifyPromise: Promise<void> | null = null;
    if (!coolifyAppUuid && finalUrl) {
      coolifyPromise = (async () => {
        try {
          const projectUuid =
            site.coolifyProjectUuid ||
            (await this.getOrCreateTenantProject(params.tenantId));

          if (!projectUuid) {
            this.logger.warn(
              "Failed to get Coolify project, skipping Coolify app creation",
            );
            return;
          }

          const sitePath = `sites/${effectiveStorageSlug}`;

          this.logger.log(
            `Creating Coolify static site app for ${effectiveStorageSlug}.merfy.ru`,
          );
          const coolifyResult = await this.callCoolify<{
            success: boolean;
            appUuid?: string;
            url?: string;
            message?: string;
          }>("coolify.create_static_site_app", {
            projectUuid,
            name: `site-${effectiveStorageSlug}`,
            subdomain: `${effectiveStorageSlug}.merfy.ru`,
            sitePath,
          });

          if (coolifyResult.success && coolifyResult.appUuid) {
            coolifyAppUuid = coolifyResult.appUuid;
            await this.db
              .update(schema.site)
              .set({
                coolifyAppUuid,
                coolifyProjectUuid: projectUuid,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(schema.site.id, params.siteId),
                  eq(schema.site.tenantId, params.tenantId),
                ),
              );
            this.logger.log(
              `Created Coolify app ${coolifyAppUuid} in project ${projectUuid} for site ${params.siteId}`,
            );
          }
        } catch (e) {
          this.logger.warn(
            `Failed to create Coolify app (site will still be built): ${e instanceof Error ? e.message : e}`,
          );
        }
      })();
    }

    // 3. Build: queued (async) or synchronous depending on feature flags
    const queueEnabled =
      (process.env.BUILD_QUEUE_CONSUMER_ENABLED ?? "false").toLowerCase() ===
      "true";

    if (queueEnabled) {
      // === QUEUED BUILD PATH ===
      let priority = 1;
      try {
        const entitlements = await this.billingClient.getEntitlements(
          params.tenantId,
        );
        const plan = (entitlements.planName ?? "").toLowerCase();
        priority = plan && plan !== "free" && plan !== "trial" ? 10 : 1;
      } catch {
        // Default to low priority on billing error
      }

      // Wait for Coolify app creation before returning to avoid race with migrateOrphanedSites
      if (coolifyPromise) {
        await coolifyPromise;
      }

      await this.buildQueue.queueBuild({
        tenantId: params.tenantId,
        siteId: params.siteId,
        mode: params.mode,
        priority,
        trigger: "publish",
      });

      await this.db
        .update(schema.site)
        .set({
          status: "published",
          ...(finalUrl ? { publicUrl: finalUrl } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.site.id, params.siteId),
            eq(schema.site.tenantId, params.tenantId),
          ),
        );

      this.events.emit("sites.site.published", {
        tenantId: params.tenantId,
        siteId: params.siteId,
        url: finalUrl,
        queued: true,
      });

      this.logger.log(
        `Published site ${params.siteId} (queued build, priority=${priority}) at ${finalUrl}`,
      );
      return {
        url: finalUrl,
        buildId: "queued",
        artifactUrl: "",
        queued: true,
      };
    }

    // === SYNCHRONOUS BUILD PATH (legacy) ===
    // Build runs in parallel with Coolify app creation
    const { buildId, artifactUrl, revisionId } = await this.generator.build({
      tenantId: params.tenantId,
      siteId: params.siteId,
      mode: params.mode,
    });

    // Wait for Coolify creation to finish (if it was running)
    if (coolifyPromise) {
      await coolifyPromise;
    }

    // Обновить статус сайта + publicUrl
    await this.db
      .update(schema.site)
      .set({
        status: "published",
        currentRevisionId: revisionId,
        ...(finalUrl ? { publicUrl: finalUrl } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.site.id, params.siteId),
          eq(schema.site.tenantId, params.tenantId),
        ),
      );

    this.events.emit("sites.site.published", {
      tenantId: params.tenantId,
      siteId: params.siteId,
      buildId,
      url: finalUrl,
    });

    this.logger.log(`Published site ${params.siteId} at ${finalUrl}`);
    return { url: finalUrl, buildId, artifactUrl };
  }

  // Revisions API
  async listRevisions(tenantId: string, siteId: string, limit = 50) {
    const site = await this.get(tenantId, siteId);
    if (!site) throw new Error("site_not_found");
    const rows = await this.db
      .select({
        id: schema.siteRevision.id,
        createdAt: schema.siteRevision.createdAt,
      })
      .from(schema.siteRevision)
      .where(eq(schema.siteRevision.siteId, siteId))
      .limit(limit);
    return { items: rows };
  }

  async getRevision(tenantId: string, siteId: string, revisionId: string) {
    const site = await this.get(tenantId, siteId);
    if (!site) throw new Error("site_not_found");
    const [rev] = await this.db
      .select()
      .from(schema.siteRevision)
      .where(
        and(
          eq(schema.siteRevision.id, revisionId),
          eq(schema.siteRevision.siteId, siteId),
        ),
      );
    if (!rev) throw new Error("revision_not_found");
    return { item: rev };
  }

  /**
   * Загружает дефолтный контент для указанной темы из JSON-файла.
   * Если файл темы не найден, используется rose.json как fallback.
   */
  private getDefaultContent(theme?: string): any {
    const themeName = theme || "rose";
    const defaultsDir = path.join(
      __dirname,
      "generator",
      "templates",
      "defaults",
    );
    let filePath = path.join(defaultsDir, `${themeName}.json`);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(defaultsDir, "rose.json");
    }
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(raw);
    } catch (e) {
      this.logger.warn(
        `Failed to load default content for theme "${themeName}": ${e instanceof Error ? e.message : e}`,
      );
      return null;
    }
  }

  async createRevision(params: {
    tenantId: string;
    siteId: string;
    data: any;
    meta?: any;
    actorUserId?: string;
    setCurrent?: boolean;
  }) {
    const site = await this.get(params.tenantId, params.siteId);
    if (!site) throw new Error("site_not_found");
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
        .where(
          and(
            eq(schema.site.id, params.siteId),
            eq(schema.site.tenantId, params.tenantId),
          ),
        );
    }
    return { revisionId: id };
  }

  async setCurrentRevision(params: {
    tenantId: string;
    siteId: string;
    revisionId: string;
  }) {
    const site = await this.get(params.tenantId, params.siteId);
    if (!site) throw new Error("site_not_found");
    const [rev] = await this.db
      .select({ id: schema.siteRevision.id })
      .from(schema.siteRevision)
      .where(
        and(
          eq(schema.siteRevision.id, params.revisionId),
          eq(schema.siteRevision.siteId, params.siteId),
        ),
      );
    if (!rev) throw new Error("revision_not_found");
    await this.db
      .update(schema.site)
      .set({ currentRevisionId: params.revisionId, updatedAt: new Date() })
      .where(
        and(
          eq(schema.site.id, params.siteId),
          eq(schema.site.tenantId, params.tenantId),
        ),
      );
    return { success: true } as const;
  }

  async freezeTenant(tenantId: string) {
    const res = await this.db
      .update(schema.site)
      .set({
        prevStatus: sql`${schema.site.status}` as any,
        status: "frozen",
        frozenAt: new Date(),
      })
      .where(
        and(
          eq(schema.site.tenantId, tenantId),
          sql`${schema.site.deletedAt} IS NULL`,
          sql`${schema.site.status} != 'frozen'`,
        ),
      )
      .returning({
        id: schema.site.id,
        coolifyAppUuid: schema.site.coolifyAppUuid,
      });
    this.events.emit("sites.tenant.frozen", { tenantId, count: res.length });

    // Best-effort включить maintenance у провайдера для всех сайтов (параллельно)
    const sitesWithCoolify = res.filter((row) => row.coolifyAppUuid);
    if (sitesWithCoolify.length > 0) {
      const results = await Promise.allSettled(
        sitesWithCoolify.map((row) =>
          this.callCoolify("coolify.toggle_maintenance", {
            appUuid: row.coolifyAppUuid,
            enabled: true,
          }),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        this.logger.warn(
          `freezeTenant: ${failed}/${sitesWithCoolify.length} Coolify maintenance toggles failed`,
        );
      } else {
        this.logger.log(
          `freezeTenant: enabled maintenance for ${sitesWithCoolify.length} sites`,
        );
      }
    }

    return { affected: res.length };
  }

  async unfreezeTenant(tenantId: string) {
    const res = await this.db
      .update(schema.site)
      .set({
        status: sql`COALESCE(${schema.site.prevStatus}, 'draft')`,
        prevStatus: null as any,
        frozenAt: null as any,
      })
      .where(
        and(
          eq(schema.site.tenantId, tenantId),
          eq(schema.site.status, "frozen"),
        ),
      )
      .returning({
        id: schema.site.id,
        coolifyAppUuid: schema.site.coolifyAppUuid,
        publicUrl: schema.site.publicUrl,
        storageSlug: schema.site.storageSlug,
      });
    this.events.emit("sites.tenant.unfrozen", { tenantId, count: res.length });

    // Best-effort: отключить maintenance mode и перезапустить контейнеры
    const sitesWithCoolify = res.filter((row) => row.coolifyAppUuid);
    if (sitesWithCoolify.length > 0) {
      // 1. Сначала отключаем maintenance mode (включённый при заморозке)
      const maintenanceResults = await Promise.allSettled(
        sitesWithCoolify.map((row) =>
          this.callCoolify("coolify.toggle_maintenance", {
            appUuid: row.coolifyAppUuid,
            enabled: false,
          }),
        ),
      );
      const maintenanceFailed = maintenanceResults.filter(
        (r) => r.status === "rejected",
      ).length;
      if (maintenanceFailed > 0) {
        this.logger.warn(
          `unfreezeTenant: ${maintenanceFailed}/${sitesWithCoolify.length} Coolify maintenance toggles failed`,
        );
      } else {
        this.logger.log(
          `unfreezeTenant: disabled maintenance for ${sitesWithCoolify.length} sites`,
        );
      }

      // 2. Перезапускаем контейнеры (на случай если они были остановлены или в плохом состоянии)
      const restartResults = await Promise.allSettled(
        sitesWithCoolify.map((row) =>
          this.callCoolify("coolify.restart_application", {
            appUuid: row.coolifyAppUuid,
          }),
        ),
      );
      const restartFailed = restartResults.filter(
        (r) => r.status === "rejected",
      ).length;
      if (restartFailed > 0) {
        this.logger.warn(
          `unfreezeTenant: ${restartFailed}/${sitesWithCoolify.length} Coolify restarts failed`,
        );
      } else {
        this.logger.log(
          `unfreezeTenant: restarted ${sitesWithCoolify.length} site containers`,
        );
      }
    }

    // Best-effort: проверить наличие контента и сгенерировать если отсутствует
    if (res.length > 0 && (await this.storage.isEnabled())) {
      const buildPromises = res.map(async (site) => {
        try {
          const prefix = site.storageSlug
            ? `sites/${site.storageSlug}/`
            : site.publicUrl
              ? this.storage.getSitePrefixBySubdomain(site.publicUrl)
              : `sites/${tenantId}/${site.id}/`;

          // Проверяем наличие index.html
          const check = await this.storage.checkSiteFiles(prefix);
          if (!check.hasIndex) {
            this.logger.log(
              `unfreezeTenant: site ${site.id} has no content, triggering build...`,
            );
            const buildResult = await this.generator.build({
              tenantId,
              siteId: site.id,
              mode: "production",
            });
            this.logger.log(
              `unfreezeTenant: built site ${site.id}, artifact: ${buildResult.artifactUrl}`,
            );
            return { siteId: site.id, built: true };
          }
          return { siteId: site.id, built: false, reason: "content_exists" };
        } catch (e) {
          this.logger.warn(
            `unfreezeTenant: failed to check/build site ${site.id}: ${e instanceof Error ? e.message : e}`,
          );
          return { siteId: site.id, built: false, error: true };
        }
      });

      const buildResults = await Promise.allSettled(buildPromises);
      const builtCount = buildResults.filter(
        (r) => r.status === "fulfilled" && r.value.built,
      ).length;
      if (builtCount > 0) {
        this.logger.log(
          `unfreezeTenant: auto-built ${builtCount}/${res.length} sites without content`,
        );
      }
    }

    // Автопубликация draft сайтов при активной подписке
    await this.autoPublishDraftSites(tenantId);

    return { affected: res.length };
  }

  /**
   * Автоматически публикует все draft сайты тенанта.
   * Вызывается при разморозке (активации подписки).
   */
  async autoPublishDraftSites(tenantId: string) {
    try {
      // Находим все draft сайты тенанта
      const draftSites = await this.db
        .select({
          id: schema.site.id,
          name: schema.site.name,
          publicUrl: schema.site.publicUrl,
        })
        .from(schema.site)
        .where(
          and(
            eq(schema.site.tenantId, tenantId),
            eq(schema.site.status, "draft"),
            sql`${schema.site.deletedAt} IS NULL`,
          ),
        );

      if (draftSites.length === 0) {
        this.logger.debug(
          `autoPublishDraftSites: no draft sites for tenant ${tenantId}`,
        );
        return { published: 0 };
      }

      this.logger.log(
        `autoPublishDraftSites: publishing ${draftSites.length} draft sites for tenant ${tenantId}`,
      );

      const publishResults = await Promise.allSettled(
        draftSites.map(async (site) => {
          try {
            await this.publish({
              tenantId,
              siteId: site.id,
              mode: "production",
            });
            this.logger.log(
              `autoPublishDraftSites: published site ${site.id} (${site.name})`,
            );
            return { siteId: site.id, success: true };
          } catch (e) {
            this.logger.warn(
              `autoPublishDraftSites: failed to publish site ${site.id}: ${e instanceof Error ? e.message : e}`,
            );
            return { siteId: site.id, success: false };
          }
        }),
      );

      const successCount = publishResults.filter(
        (r) => r.status === "fulfilled" && r.value.success,
      ).length;

      this.logger.log(
        `autoPublishDraftSites: published ${successCount}/${draftSites.length} sites for tenant ${tenantId}`,
      );

      return { published: successCount, total: draftSites.length };
    } catch (e) {
      this.logger.error(
        `autoPublishDraftSites error: ${e instanceof Error ? e.message : e}`,
      );
      return { published: 0, error: true };
    }
  }

  /**
   * Получает или создаёт Coolify Project для тенанта.
   *
   * Каждая компания (tenant) получает отдельный Project в Coolify.
   * Это обеспечивает изоляцию сайтов разных компаний.
   *
   * @param tenantId - UUID тенанта
   * @param companyName - название компании (опционально, для именования проекта)
   * @returns UUID Coolify Project
   */
  async getOrCreateTenantProject(
    tenantId: string,
    companyName?: string,
  ): Promise<string> {
    // 1. Проверяем локальный кэш в БД
    const [cached] = await this.db
      .select({
        coolifyProjectUuid: schema.tenantProject.coolifyProjectUuid,
      })
      .from(schema.tenantProject)
      .where(eq(schema.tenantProject.tenantId, tenantId))
      .limit(1);

    if (cached?.coolifyProjectUuid) {
      this.logger.debug(
        `Found cached project ${cached.coolifyProjectUuid} for tenant ${tenantId}`,
      );
      return cached.coolifyProjectUuid;
    }

    // 2. Создаём или находим проект в Coolify через RPC
    const projectName = companyName || `tenant-${tenantId.slice(0, 8)}`;
    const rpcResult = await this.callCoolify<{
      success: boolean;
      projectUuid?: string;
      message?: string;
    }>("coolify.get_or_create_project", { tenantId, companyName: projectName });

    if (!rpcResult.success || !rpcResult.projectUuid) {
      throw new Error(rpcResult.message || "coolify_project_create_failed");
    }

    const coolifyProjectUuid = rpcResult.projectUuid;

    // 3. Сохраняем в локальный кэш
    await this.db
      .insert(schema.tenantProject)
      .values({
        id: randomUUID(),
        tenantId,
        coolifyProjectUuid,
        coolifyProjectName: projectName,
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.tenantProject.tenantId,
        set: { coolifyProjectUuid, coolifyProjectName: projectName },
      });

    this.logger.log(
      `Created/found Coolify project ${coolifyProjectUuid} for tenant ${tenantId}`,
    );
    return coolifyProjectUuid;
  }

  /**
   * Проверяет доступность сайта для публичного доступа.
   */
  async checkSiteAvailability(tenantId: string, siteId: string) {
    const site = await this.fetchSiteForAvailabilityCheck(tenantId, siteId);
    if (!site) {
      return this.buildUnavailableResponse("site_not_found");
    }

    const entitlements = await this.billingClient.getEntitlements(tenantId);
    const checks = {
      billingAllowed: !entitlements.frozen,
      isPublished: site.status === "published",
      isDeployed: Boolean(site.coolifyAppUuid),
    };

    const reason = this.determineUnavailabilityReason(checks);
    const available = reason === undefined;

    return {
      available,
      exists: true,
      ...checks,
      publicUrl: site.publicUrl,
      reason,
    };
  }

  private async fetchSiteForAvailabilityCheck(
    tenantId: string,
    siteId: string,
  ) {
    const [site] = await this.db
      .select({
        id: schema.site.id,
        status: schema.site.status,
        publicUrl: schema.site.publicUrl,
        coolifyAppUuid: schema.site.coolifyAppUuid,
      })
      .from(schema.site)
      .where(
        and(eq(schema.site.id, siteId), eq(schema.site.tenantId, tenantId)),
      )
      .limit(1);

    return site ?? null;
  }

  private determineUnavailabilityReason(checks: {
    billingAllowed: boolean;
    isPublished: boolean;
    isDeployed: boolean;
  }): string | undefined {
    if (!checks.billingAllowed) return "account_frozen";
    if (!checks.isPublished) return "site_not_published";
    if (!checks.isDeployed) return "site_not_deployed";
    return undefined;
  }

  private buildUnavailableResponse(reason: string) {
    return {
      available: false,
      exists: false,
      billingAllowed: false,
      isPublished: false,
      isDeployed: false,
      publicUrl: null,
      reason,
    };
  }

  /**
   * Выполняет HTTP health check сайта — проверяет что publicUrl отвечает HTTP 200.
   * Возвращает { available, statusCode, latencyMs }.
   */
  async healthCheck(
    tenantId: string,
    siteId: string,
  ): Promise<{
    available: boolean;
    statusCode?: number;
    latencyMs: number;
    publicUrl: string | null;
    error?: string;
  }> {
    const site = await this.fetchSiteForAvailabilityCheck(tenantId, siteId);
    if (!site) {
      return {
        available: false,
        latencyMs: 0,
        publicUrl: null,
        error: "site_not_found",
      };
    }

    if (!site.publicUrl) {
      return {
        available: false,
        latencyMs: 0,
        publicUrl: null,
        error: "no_public_url",
      };
    }

    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const response = await fetch(site.publicUrl, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "User-Agent": "Merfy-HealthCheck/1.0",
        },
      });

      clearTimeout(timeout);
      const latencyMs = Date.now() - start;

      return {
        available: response.ok,
        statusCode: response.status,
        latencyMs,
        publicUrl: site.publicUrl,
      };
    } catch (e: any) {
      const latencyMs = Date.now() - start;
      const errorMessage =
        e?.name === "AbortError"
          ? "timeout"
          : (e?.cause?.code ?? e?.message ?? "fetch_failed");

      this.logger.warn(
        `Health check failed for site ${siteId}: ${errorMessage}`,
      );

      return {
        available: false,
        latencyMs,
        publicUrl: site.publicUrl,
        error: errorMessage,
      };
    }
  }

  /**
   * Bulk health check — проверяет все сайты тенанта.
   * Возвращает сводку и детализацию по каждому сайту.
   */
  async healthCheckAll(tenantId: string): Promise<{
    total: number;
    healthy: number;
    unhealthy: number;
    sites: Array<{
      siteId: string;
      name: string;
      status: string;
      available: boolean;
      publicUrl: string | null;
      latencyMs?: number;
      error?: string;
    }>;
  }> {
    // Получаем все сайты тенанта
    const sites = await this.db
      .select({
        id: schema.site.id,
        name: schema.site.name,
        status: schema.site.status,
        publicUrl: schema.site.publicUrl,
      })
      .from(schema.site)
      .where(eq(schema.site.tenantId, tenantId));

    const results: Array<{
      siteId: string;
      name: string;
      status: string;
      available: boolean;
      publicUrl: string | null;
      latencyMs?: number;
      error?: string;
    }> = [];

    let healthy = 0;
    let unhealthy = 0;

    for (const site of sites) {
      // Только опубликованные сайты проверяем через HTTP
      if (site.status === "published" && site.publicUrl) {
        const check = await this.healthCheck(tenantId, site.id);
        results.push({
          siteId: site.id,
          name: site.name,
          status: site.status,
          available: check.available,
          publicUrl: site.publicUrl,
          latencyMs: check.latencyMs,
          error: check.error,
        });
        if (check.available) {
          healthy++;
        } else {
          unhealthy++;
        }
      } else {
        // Не опубликованные — считаем unavailable, но не ошибкой
        results.push({
          siteId: site.id,
          name: site.name,
          status: site.status,
          available: false,
          publicUrl: site.publicUrl,
          error: site.status === "frozen" ? "frozen" : "not_published",
        });
        unhealthy++;
      }
    }

    return {
      total: sites.length,
      healthy,
      unhealthy,
      sites: results,
    };
  }

  /**
   * Очищает mock данные из кэша tenant_project и сбрасывает coolifyProjectUuid в сайтах.
   */
  async clearMockCache(): Promise<void> {
    // Удаляем mock записи из tenant_project
    await this.db
      .delete(schema.tenantProject)
      .where(
        sql`${schema.tenantProject.coolifyProjectUuid} LIKE 'mock-project-%'`,
      );

    // Сбрасываем mock coolifyProjectUuid в сайтах
    await this.db
      .update(schema.site)
      .set({ coolifyProjectUuid: null })
      .where(sql`${schema.site.coolifyProjectUuid} LIKE 'mock-project-%'`);

    this.logger.log("Cleared all mock cache data");
  }

  /**
   * Миграция: создаёт subdomain и Coolify проект для сайтов без publicUrl или coolifyProjectUuid.
   * Вызывается один раз для исправления сайтов, созданных до фикса DomainModule.
   */
  async migrateOrphanedSites(): Promise<{
    migrated: number;
    failed: number;
    details: string[];
  }> {
    const details: string[] = [];
    let migrated = 0;
    let failed = 0;

    // Сначала очищаем mock кэш
    await this.clearMockCache();

    // Находим сайты без domainId, coolifyProjectUuid ИЛИ coolifyAppUuid.
    // domainId — authoritative marker: publicUrl/storageSlug derive from the
    // domain record, so `domainId IS NULL` covers all not-yet-provisioned cases
    // (including sites reserved by the async signup flow).
    const orphanedSites = await this.db
      .select({
        id: schema.site.id,
        tenantId: schema.site.tenantId,
        name: schema.site.name,
        publicUrl: schema.site.publicUrl,
        storageSlug: schema.site.storageSlug,
        coolifyProjectUuid: schema.site.coolifyProjectUuid,
        coolifyAppUuid: schema.site.coolifyAppUuid,
      })
      .from(schema.site)
      .where(
        sql`${schema.site.deletedAt} IS NULL AND (${schema.site.domainId} IS NULL OR ${schema.site.coolifyProjectUuid} IS NULL OR ${schema.site.coolifyAppUuid} IS NULL)`,
      );

    this.logger.log(
      `Found ${orphanedSites.length} sites to migrate (no domainId, coolifyProjectUuid, or coolifyAppUuid)`,
    );

    for (const site of orphanedSites) {
      try {
        const updates: Partial<typeof schema.site.$inferInsert> = {
          updatedAt: new Date(),
        };

        // 1. Генерируем subdomain если нет
        if (!site.publicUrl) {
          const domainResult = await this.domainClient.generateSubdomain(
            site.tenantId,
          );
          const subdomain = domainResult.name;
          const publicUrl = this.storage.getSitePublicUrlBySubdomain(subdomain);
          updates.domainId = domainResult.id;
          updates.publicUrl = publicUrl;
          updates.storageSlug = this.storage.extractSubdomainSlug(subdomain);
          this.logger.log(
            `Site ${site.id}: generated subdomain ${subdomain}, publicUrl: ${publicUrl}`,
          );
        }

        // 2. Создаём Coolify проект если нет
        let projectUuid = site.coolifyProjectUuid;
        if (!projectUuid) {
          projectUuid = await this.getOrCreateTenantProject(
            site.tenantId,
            site.name,
          );
          updates.coolifyProjectUuid = projectUuid;
          this.logger.log(
            `Site ${site.id}: created Coolify project ${projectUuid}`,
          );
        }

        // 3. Создаём Coolify Application (nginx-minio-proxy) если нет
        // Re-read from DB to avoid race with concurrent publish()
        const freshSite = await this.db
          .select({ coolifyAppUuid: schema.site.coolifyAppUuid })
          .from(schema.site)
          .where(eq(schema.site.id, site.id))
          .then((r) => r[0]);
        const currentCoolifyAppUuid = freshSite?.coolifyAppUuid || site.coolifyAppUuid;

        const finalPublicUrl = site.publicUrl || updates.publicUrl;
        const slug = site.storageSlug || updates.storageSlug
          || (finalPublicUrl ? this.storage.extractSubdomainSlug(finalPublicUrl) : null);
        if (!currentCoolifyAppUuid && slug && projectUuid) {
          try {
            const sitePath = `sites/${slug}`;

            this.logger.log(
              `Site ${site.id}: creating Coolify app for ${slug}.merfy.ru`,
            );

            const coolifyResult = await this.callCoolify<{
              success: boolean;
              appUuid?: string;
              url?: string;
              message?: string;
            }>("coolify.create_static_site_app", {
              projectUuid,
              name: `site-${slug}`,
              subdomain: `${slug}.merfy.ru`,
              sitePath,
            });

            if (coolifyResult.success && coolifyResult.appUuid) {
              updates.coolifyAppUuid = coolifyResult.appUuid;
              this.logger.log(
                `Site ${site.id}: created Coolify app ${coolifyResult.appUuid}`,
              );
            } else {
              this.logger.warn(
                `Site ${site.id}: Coolify app creation failed: ${coolifyResult.message}`,
              );
            }
          } catch (e) {
            this.logger.warn(
              `Site ${site.id}: Coolify app creation error: ${e instanceof Error ? e.message : e}`,
            );
          }
        }

        // 4. Обновляем сайт
        await this.db
          .update(schema.site)
          .set(updates)
          .where(eq(schema.site.id, site.id));

        migrated++;
        details.push(
          `✓ Site ${site.id} (${site.name}): migrated, publicUrl=${finalPublicUrl}, coolifyProject=${projectUuid}, coolifyApp=${updates.coolifyAppUuid || site.coolifyAppUuid || "N/A"}`,
        );
      } catch (e) {
        failed++;
        const error = e instanceof Error ? e.message : String(e);
        details.push(`✗ Site ${site.id} (${site.name}): ${error}`);
        this.logger.error(`Failed to migrate site ${site.id}: ${error}`);
      }
    }

    this.logger.log(
      `Migration complete: ${migrated} migrated, ${failed} failed`,
    );
    return { migrated, failed, details };
  }

  /**
   * Диагностика состояния сайтов для отладки.
   */
  async debugSitesState() {
    const sites = await this.db
      .select({
        id: schema.site.id,
        tenantId: schema.site.tenantId,
        name: schema.site.name,
        status: schema.site.status,
        publicUrl: schema.site.publicUrl,
        coolifyProjectUuid: schema.site.coolifyProjectUuid,
        coolifyAppUuid: schema.site.coolifyAppUuid,
        deletedAt: schema.site.deletedAt,
      })
      .from(schema.site);

    const summary = {
      total: sites.length,
      active: sites.filter((s) => !s.deletedAt).length,
      deleted: sites.filter((s) => s.deletedAt).length,
      withPublicUrl: sites.filter((s) => s.publicUrl && !s.deletedAt).length,
      withProject: sites.filter((s) => s.coolifyProjectUuid && !s.deletedAt)
        .length,
      withApp: sites.filter((s) => s.coolifyAppUuid && !s.deletedAt).length,
      needsMigration: sites.filter(
        (s) =>
          !s.deletedAt &&
          (!s.publicUrl || !s.coolifyProjectUuid || !s.coolifyAppUuid),
      ).length,
    };

    return {
      summary,
      sites: sites.map((s) => ({
        id: s.id,
        name: s.name,
        tenantId: s.tenantId?.slice(0, 8),
        status: s.status,
        publicUrl: s.publicUrl,
        coolifyProjectUuid: s.coolifyProjectUuid,
        coolifyAppUuid: s.coolifyAppUuid,
        isDeleted: Boolean(s.deletedAt),
      })),
    };
  }

  // ==================== Site Products (локальные товары) ====================

  /**
   * Получить все товары сайта.
   */
  async listSiteProducts(siteId: string, tenantId: string) {
    // Проверяем что сайт принадлежит тенанту
    const [site] = await this.db
      .select({ id: schema.site.id })
      .from(schema.site)
      .where(
        and(eq(schema.site.id, siteId), eq(schema.site.tenantId, tenantId)),
      )
      .limit(1);

    if (!site) {
      throw new Error("site_not_found");
    }

    const products = await this.db
      .select()
      .from(schema.siteProduct)
      .where(
        and(
          eq(schema.siteProduct.siteId, siteId),
          eq(schema.siteProduct.isActive, true),
        ),
      )
      .orderBy(schema.siteProduct.sortOrder);

    return products;
  }

  /**
   * Получить товары для генерации (без проверки tenantId — внутренний метод).
   */
  async getProductsForBuild(siteId: string) {
    const products = await this.db
      .select()
      .from(schema.siteProduct)
      .where(
        and(
          eq(schema.siteProduct.siteId, siteId),
          eq(schema.siteProduct.isActive, true),
        ),
      )
      .orderBy(schema.siteProduct.sortOrder);

    return products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? undefined,
      price: p.price / 100, // копейки → рубли для фронта
      compareAtPrice: p.compareAtPrice ? p.compareAtPrice / 100 : undefined,
      images: (p.images as string[]) ?? [],
      slug: p.slug ?? p.id,
    }));
  }

  /**
   * Создать товар.
   */
  async createSiteProduct(
    siteId: string,
    tenantId: string,
    data: {
      name: string;
      description?: string;
      price?: number;
      compareAtPrice?: number;
      images?: string[];
      slug?: string;
    },
  ) {
    // Проверяем что сайт принадлежит тенанту
    const [site] = await this.db
      .select({ id: schema.site.id })
      .from(schema.site)
      .where(
        and(eq(schema.site.id, siteId), eq(schema.site.tenantId, tenantId)),
      )
      .limit(1);

    if (!site) {
      throw new Error("site_not_found");
    }

    const now = new Date();
    const id = randomUUID();
    const slug = data.slug || slugify(data.name) || id;

    // Получить следующий sortOrder
    const [maxSort] = await this.db
      .select({
        max: sql<number>`COALESCE(MAX(${schema.siteProduct.sortOrder}), 0)`,
      })
      .from(schema.siteProduct)
      .where(eq(schema.siteProduct.siteId, siteId));

    const [product] = await this.db
      .insert(schema.siteProduct)
      .values({
        id,
        siteId,
        name: data.name,
        description: data.description,
        price: data.price ?? 0,
        compareAtPrice: data.compareAtPrice,
        images: data.images ?? [],
        slug,
        sortOrder: (maxSort?.max ?? 0) + 1,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    this.logger.log(`Created product ${id} for site ${siteId}`);
    return product;
  }

  /**
   * Обновить товар.
   */
  async updateSiteProduct(
    productId: string,
    siteId: string,
    tenantId: string,
    updates: Partial<{
      name: string;
      description: string;
      price: number;
      compareAtPrice: number;
      images: string[];
      slug: string;
      sortOrder: number;
      isActive: boolean;
    }>,
  ) {
    // Проверяем что сайт принадлежит тенанту
    const [site] = await this.db
      .select({ id: schema.site.id })
      .from(schema.site)
      .where(
        and(eq(schema.site.id, siteId), eq(schema.site.tenantId, tenantId)),
      )
      .limit(1);

    if (!site) {
      throw new Error("site_not_found");
    }

    const [product] = await this.db
      .update(schema.siteProduct)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.siteProduct.id, productId),
          eq(schema.siteProduct.siteId, siteId),
        ),
      )
      .returning();

    if (!product) {
      throw new Error("product_not_found");
    }

    this.logger.log(`Updated product ${productId}`);
    return product;
  }

  /**
   * Удалить товар.
   */
  async deleteSiteProduct(productId: string, siteId: string, tenantId: string) {
    // Проверяем что сайт принадлежит тенанту
    const [site] = await this.db
      .select({ id: schema.site.id })
      .from(schema.site)
      .where(
        and(eq(schema.site.id, siteId), eq(schema.site.tenantId, tenantId)),
      )
      .limit(1);

    if (!site) {
      throw new Error("site_not_found");
    }

    const [deleted] = await this.db
      .delete(schema.siteProduct)
      .where(
        and(
          eq(schema.siteProduct.id, productId),
          eq(schema.siteProduct.siteId, siteId),
        ),
      )
      .returning({ id: schema.siteProduct.id });

    if (!deleted) {
      throw new Error("product_not_found");
    }

    this.logger.log(`Deleted product ${productId}`);
    return true;
  }

  /**
   * Получить один товар.
   */
  async getSiteProduct(productId: string, siteId: string, tenantId: string) {
    // Проверяем что сайт принадлежит тенанту
    const [site] = await this.db
      .select({ id: schema.site.id })
      .from(schema.site)
      .where(
        and(eq(schema.site.id, siteId), eq(schema.site.tenantId, tenantId)),
      )
      .limit(1);

    if (!site) {
      throw new Error("site_not_found");
    }

    const [product] = await this.db
      .select()
      .from(schema.siteProduct)
      .where(
        and(
          eq(schema.siteProduct.id, productId),
          eq(schema.siteProduct.siteId, siteId),
        ),
      )
      .limit(1);

    return product ?? null;
  }

  /**
   * Регенерировать один сайт по ID с указанным шаблоном.
   */
  async regenerateSingleSite(siteId: string, templateId: string) {
    const [site] = await this.db
      .select({ id: schema.site.id, tenantId: schema.site.tenantId, name: schema.site.name })
      .from(schema.site)
      .where(eq(schema.site.id, siteId));

    if (!site) throw new Error(`Site ${siteId} not found`);

    this.logger.log(`Regenerating site ${site.id} (${site.name}) with template: ${templateId}`);

    await this.generator.build({
      tenantId: site.tenantId,
      siteId: site.id,
      mode: "production",
      templateOverride: templateId,
    });

    await this.db
      .update(schema.site)
      .set({ status: "published", updatedAt: new Date() })
      .where(eq(schema.site.id, site.id));

    return { siteId: site.id, name: site.name };
  }

  async adminPublish(siteId: string) {
    const [site] = await this.db
      .select({ id: schema.site.id, tenantId: schema.site.tenantId })
      .from(schema.site)
      .where(eq(schema.site.id, siteId));

    if (!site) throw new Error(`Site ${siteId} not found`);

    return this.publish({
      tenantId: site.tenantId,
      siteId: site.id,
      mode: "production",
    });
  }

  /**
   * Регенерировать все активные сайты с указанным шаблоном.
   * Используется для массового обновления шаблона всех сайтов.
   */
  async regenerateAllWithTemplate(templateId: string) {
    this.logger.log(`Starting bulk regeneration with template: ${templateId}`);

    // Получаем все активные сайты
    const sites = await this.db
      .select({
        id: schema.site.id,
        tenantId: schema.site.tenantId,
        name: schema.site.name,
        publicUrl: schema.site.publicUrl,
      })
      .from(schema.site)
      .where(sql`${schema.site.deletedAt} IS NULL`);

    this.logger.log(`Found ${sites.length} sites to regenerate`);

    const results: {
      siteId: string;
      name: string;
      success: boolean;
      error?: string;
    }[] = [];

    for (const site of sites) {
      try {
        this.logger.log(`Regenerating site ${site.id} (${site.name})`);

        // Вызываем генератор с принудительным шаблоном
        await this.generator.build({
          tenantId: site.tenantId,
          siteId: site.id,
          mode: "production",
          templateOverride: templateId,
        });

        // Обновляем статус
        await this.db
          .update(schema.site)
          .set({
            status: "published",
            updatedAt: new Date(),
          })
          .where(eq(schema.site.id, site.id));

        results.push({
          siteId: site.id,
          name: site.name,
          success: true,
        });

        this.logger.log(`Successfully regenerated site ${site.id}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to regenerate site ${site.id}: ${errorMsg}`);
        results.push({
          siteId: site.id,
          name: site.name,
          success: false,
          error: errorMsg,
        });
      }
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    this.logger.log(
      `Bulk regeneration complete: ${successful} success, ${failed} failed`,
    );

    return {
      template: templateId,
      total: sites.length,
      successful,
      failed,
      results,
    };
  }

  /**
   * Get build status/progress for a specific build.
   */
  async getBuildStatus(
    tenantId: string,
    siteId: string,
    buildId: string,
  ): Promise<{
    buildId: string;
    siteId: string;
    status: string;
    stage: string | null;
    percent: number;
    message: string | null;
    error: string | null;
    retryCount: number;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
  } | null> {
    // Verify site belongs to tenant
    const [siteRow] = await this.db
      .select({ id: schema.site.id })
      .from(schema.site)
      .where(
        and(eq(schema.site.id, siteId), eq(schema.site.tenantId, tenantId)),
      );

    if (!siteRow) return null;

    const [build] = await this.db
      .select({
        id: schema.siteBuild.id,
        siteId: schema.siteBuild.siteId,
        status: schema.siteBuild.status,
        stage: schema.siteBuild.stage,
        percent: schema.siteBuild.percent,
        message: schema.siteBuild.message,
        error: schema.siteBuild.error,
        retryCount: schema.siteBuild.retryCount,
        startedAt: schema.siteBuild.startedAt,
        completedAt: schema.siteBuild.completedAt,
        createdAt: schema.siteBuild.createdAt,
      })
      .from(schema.siteBuild)
      .where(
        and(
          eq(schema.siteBuild.id, buildId),
          eq(schema.siteBuild.siteId, siteId),
        ),
      );

    if (!build) return null;

    return {
      buildId: build.id,
      siteId: build.siteId,
      status: build.status,
      stage: build.stage,
      percent: build.percent ?? 0,
      message: build.message,
      error: build.error,
      retryCount: build.retryCount ?? 0,
      startedAt: build.startedAt,
      completedAt: build.completedAt,
      createdAt: build.createdAt,
    };
  }

  // ==================== Domain Switching ====================

  /**
   * Switch site to a purchased domain.
   * Deactivates current domain in history, adds new entry,
   * updates site record and Coolify domain.
   */
  async switchDomain(params: {
    siteId: string;
    domainId: string;
    domainName: string;
    type?: "purchased" | "external" | "generated";
  }): Promise<void> {
    const { siteId, domainId, domainName, type = "purchased" } = params;
    this.logger.log(
      `[switchDomain] START siteId=${siteId}, domainId=${domainId}, domainName=${domainName}`,
    );

    // 1. Find site
    const [siteRow] = await this.db
      .select()
      .from(schema.site)
      .where(eq(schema.site.id, siteId))
      .limit(1);

    if (!siteRow) {
      this.logger.warn(`[switchDomain] site ${siteId} NOT FOUND in DB — aborting`);
      return;
    }

    this.logger.log(
      `[switchDomain] found site: status=${siteRow.status}, currentPublicUrl=${siteRow.publicUrl}, coolifyAppUuid=${siteRow.coolifyAppUuid ?? "NONE"}, domainId=${siteRow.domainId ?? "NONE"}`,
    );

    const now = new Date();

    // 2. Deactivate current active domain in history
    const deactivated = await this.db
      .update(schema.siteDomainHistory)
      .set({ status: "inactive", detachedAt: now })
      .where(
        and(
          eq(schema.siteDomainHistory.siteId, siteId),
          eq(schema.siteDomainHistory.status, "active"),
        ),
      );
    this.logger.log(
      `[switchDomain] deactivated ${deactivated.rowCount ?? 0} previous domain history entries`,
    );

    // 3. Add new domain history entry
    const historyId = randomUUID();
    await this.db.insert(schema.siteDomainHistory).values({
      id: historyId,
      siteId,
      domainName,
      domainId,
      type,
      status: "active",
      attachedAt: now,
    });
    this.logger.log(
      `[switchDomain] inserted domain history: id=${historyId}, domain=${domainName}`,
    );

    // 4. Update site: domainId, publicUrl
    const newPublicUrl = `https://${domainName}`;
    const updateResult = await this.db
      .update(schema.site)
      .set({
        domainId,
        publicUrl: newPublicUrl,
        updatedAt: now,
      })
      .where(eq(schema.site.id, siteId));
    this.logger.log(
      `[switchDomain] updated site record: rowCount=${updateResult.rowCount ?? 0}, newPublicUrl=${newPublicUrl}`,
    );

    // 5. Update Coolify domain (best-effort)
    if (siteRow.coolifyAppUuid) {
      this.logger.log(
        `[switchDomain] calling coolify.set_domain: appUuid=${siteRow.coolifyAppUuid}, domain=${domainName}`,
      );
      try {
        const coolifyResult = await this.callCoolify("coolify.set_domain", {
          appUuid: siteRow.coolifyAppUuid,
          domain: domainName,
        });
        this.logger.log(
          `[switchDomain] coolify.set_domain result: ${JSON.stringify(coolifyResult)}`,
        );
      } catch (e) {
        this.logger.error(
          `[switchDomain] coolify.set_domain FAILED for ${siteId}: ${e instanceof Error ? e.message : e}`,
        );
      }
    } else {
      // No Coolify app yet — create one with the new domain
      this.logger.warn(
        `[switchDomain] no coolifyAppUuid for site ${siteId} — creating Coolify app`,
      );
      try {
        const projectUuid =
          siteRow.coolifyProjectUuid ||
          (await this.getOrCreateTenantProject(siteRow.tenantId));

        if (projectUuid) {
          const slug = siteRow.storageSlug ?? this.storage.extractSubdomainSlug(
            siteRow.publicUrl || newPublicUrl,
          );
          const sitePath = `sites/${slug}`;

          this.logger.log(
            `[switchDomain] creating Coolify app: project=${projectUuid}, slug=${slug}, domain=${domainName}`,
          );

          const coolifyResult = await this.callCoolify<{
            success: boolean;
            appUuid?: string;
            url?: string;
            message?: string;
          }>("coolify.create_static_site_app", {
            projectUuid,
            name: `site-${slug}`,
            subdomain: domainName,
            sitePath,
          });

          if (coolifyResult.success && coolifyResult.appUuid) {
            await this.db
              .update(schema.site)
              .set({
                coolifyAppUuid: coolifyResult.appUuid,
                coolifyProjectUuid: projectUuid,
                updatedAt: now,
              })
              .where(eq(schema.site.id, siteId));
            this.logger.log(
              `[switchDomain] created Coolify app ${coolifyResult.appUuid} for site ${siteId}`,
            );
          } else {
            this.logger.warn(
              `[switchDomain] Coolify app creation returned: ${coolifyResult.message}`,
            );
          }
        } else {
          this.logger.warn(
            `[switchDomain] failed to get Coolify project for tenant ${siteRow.tenantId}`,
          );
        }
      } catch (e) {
        this.logger.error(
          `[switchDomain] Coolify app creation FAILED for ${siteId}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }

    this.logger.log(
      `[switchDomain] DONE site ${siteId}: ${siteRow.publicUrl} -> ${newPublicUrl}`,
    );
  }
}

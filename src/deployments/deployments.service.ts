/**
 * DeploymentsService
 *
 * Оркестрирует деплой через провайдера (Coolify). Сохраняет снимок `site_deployment`
 * для аудита и отслеживания, возвращает публичный URL.
 */
import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";
import { PG_CONNECTION, CENTRAL_PROXY_APP_SENTINEL } from "../constants";
import { eq } from "drizzle-orm";
import { CoolifyProvider } from "./coolify.provider";
import { TraefikRouterService } from "./traefik-router.service";

@Injectable()
export class DeploymentsService {
  private readonly logger = new Logger(DeploymentsService.name);

  constructor(
    @Inject(PG_CONNECTION) private readonly db: NodePgDatabase<typeof schema>,
    private readonly coolify: CoolifyProvider,
    private readonly traefik: TraefikRouterService,
  ) {}

  /**
   * Включён ли режим центрального прокси (флаг SITES_USE_CENTRAL_PROXY=true).
   * Обёртка, чтобы SitesDomainService гейтил провижн через уже инжектнутый
   * `deployments` (без нового параметра конструктора, ломающего тест-харнессы).
   */
  get centralProxyEnabled(): boolean {
    return this.traefik.enabled;
  }

  /** Idempotent: пишет Traefik-роутер сайта на общий прокси. Возвращает URL. */
  async ensureCentralRouter(slug: string): Promise<string> {
    return this.traefik.ensureSiteRouter(slug);
  }

  /** Удаляет Traefik-роутер сайта (при удалении сайта). Не бросает если нет. */
  async removeCentralRouter(slug: string): Promise<void> {
    return this.traefik.removeSiteRouter(slug);
  }

  async deploy(params: {
    tenantId: string;
    siteId: string;
    buildId: string;
    artifactUrl: string;
  }) {
    // Phase 3: при включённом центральном прокси деплой = запись Traefik-роутера
    // (домен → прокси), БЕЗ создания per-site Coolify-app/контейнера. Покрывает
    // ре-деплой мигрированных сайтов (правка → rebuild → deploy) без re-inflation.
    if (this.traefik.enabled) {
      const [siteRow] = await this.db
        .select({ slug: schema.site.storageSlug })
        .from(schema.site)
        .where(eq(schema.site.id, params.siteId))
        .limit(1);
      if (siteRow?.slug) {
        const url = await this.traefik.ensureSiteRouter(siteRow.slug);
        const id = randomUUID();
        const now = new Date();
        await this.db.insert(schema.siteDeployment).values({
          id,
          siteId: params.siteId,
          buildId: params.buildId,
          coolifyAppId: CENTRAL_PROXY_APP_SENTINEL,
          coolifyEnvId: "",
          status: "deployed",
          url,
          createdAt: now,
          updatedAt: now,
        });
        return { deploymentId: id, url };
      }
      this.logger.warn(
        `deploy: central proxy включён, но нет storageSlug для site ${params.siteId} — fallback на per-site app`,
      );
    }

    const ensure = await this.coolify.ensureApp(params.siteId);
    const { url } = await this.coolify.deployBuild({
      siteId: params.siteId,
      buildId: params.buildId,
      artifactUrl: params.artifactUrl,
    });

    const id = randomUUID();
    const now = new Date();
    await this.db.insert(schema.siteDeployment).values({
      id,
      siteId: params.siteId,
      buildId: params.buildId,
      coolifyAppId: ensure.appId,
      coolifyEnvId: ensure.envId,
      status: "deployed",
      url,
      createdAt: now,
      updatedAt: now,
    });
    return { deploymentId: id, url };
  }
}

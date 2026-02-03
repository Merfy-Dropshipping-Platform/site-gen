/**
 * Health Check Controller
 *
 * Предоставляет эндпоинты для проверки состояния сервиса:
 * - GET /health — базовая проверка живости (liveness)
 * - GET /health/ready — расширенная проверка готовности (readiness)
 *
 * Используется оркестраторами (Coolify, Docker, Kubernetes) для healthcheck.
 */
import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Inject,
  Logger,
} from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import { firstValueFrom, timeout, catchError, of } from "rxjs";
import { sql } from "drizzle-orm";
import {
  PG_CONNECTION,
  BILLING_RMQ_SERVICE,
  COOLIFY_RMQ_SERVICE,
} from "./constants";
import { DomainClient } from "./domain/domain.client";
import { SitesDomainService } from "./sites.service";
import { S3StorageService } from "./storage/s3.service";

interface HealthCheck {
  name: string;
  status: "up" | "down";
  latencyMs?: number;
  error?: string;
}

@Controller()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    @Inject(PG_CONNECTION) private readonly db: any,
    @Inject(BILLING_RMQ_SERVICE) private readonly billingClient: ClientProxy,
    @Inject(COOLIFY_RMQ_SERVICE) private readonly coolifyClient: ClientProxy,
    private readonly domainClient: DomainClient,
    private readonly sitesService: SitesDomainService,
    private readonly s3Storage: S3StorageService,
  ) {}

  /**
   * Базовая проверка живости (liveness probe)
   * Возвращает 200 если сервис запущен
   */
  @Get("health")
  health() {
    return {
      status: "ok",
      service: "sites-service",
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Расширенная проверка готовности (readiness probe)
   * Проверяет подключение к зависимостям:
   * - PostgreSQL (обязательно)
   * - RabbitMQ/Billing (обязательно)
   * - Domain Service (опционально)
   * - Coolify API (опционально, только в http mode)
   */
  @Get("health/ready")
  async readiness() {
    const checks: HealthCheck[] = [];
    let healthy = true;

    // 1. Проверка PostgreSQL
    const dbCheck = await this.checkDatabase();
    checks.push(dbCheck);
    if (dbCheck.status === "down") {
      healthy = false;
    }

    // 2. Проверка RabbitMQ через Billing Service
    const rmqCheck = await this.checkRabbitMQ();
    checks.push(rmqCheck);
    if (rmqCheck.status === "down") {
      healthy = false;
    }

    // 3. Проверка Domain Service (опционально)
    const domainCheck = await this.checkDomainService();
    checks.push(domainCheck);
    // Domain Service не критичен — есть HTTP fallback

    // 4. Проверка Coolify Worker (опционально)
    const coolifyCheck = await this.checkCoolify();
    checks.push(coolifyCheck);
    // Coolify Worker не критичен для базовой работы

    // 5. Проверка MinIO/S3 (опционально)
    const minioCheck = await this.checkMinIO();
    checks.push(minioCheck);
    // MinIO не критичен для базовой работы

    return {
      status: healthy ? "ok" : "degraded",
      service: "sites-service",
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  private async checkDatabase(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      await this.db.execute(sql`SELECT 1`);
      return {
        name: "postgresql",
        status: "up",
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      this.logger.error(`Database health check failed: ${error}`);
      return {
        name: "postgresql",
        status: "down",
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : "unknown",
      };
    }
  }

  private async checkRabbitMQ(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      // Ping billing service через RPC
      const response = await firstValueFrom(
        this.billingClient.send("billing.get_plans", {}).pipe(
          timeout(3000),
          catchError(() => of(null)),
        ),
      );

      if (response) {
        return {
          name: "rabbitmq",
          status: "up",
          latencyMs: Date.now() - start,
        };
      }

      return {
        name: "rabbitmq",
        status: "down",
        latencyMs: Date.now() - start,
        error: "no_response",
      };
    } catch (error) {
      this.logger.error(`RabbitMQ health check failed: ${error}`);
      return {
        name: "rabbitmq",
        status: "down",
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : "unknown",
      };
    }
  }

  private async checkDomainService(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      const isHealthy = await this.domainClient.healthCheck();
      return {
        name: "domain-service",
        status: isHealthy ? "up" : "down",
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        name: "domain-service",
        status: "down",
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : "unknown",
      };
    }
  }

  private async checkCoolify(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      // Проверка через RPC к coolify-worker
      const result = await firstValueFrom(
        this.coolifyClient.send("coolify.health", {}).pipe(
          timeout(5000),
          catchError(() =>
            of({ success: false, status: "down", error: "rpc_timeout" }),
          ),
        ),
      );

      return {
        name: "coolify-worker",
        status: result.success && result.status === "up" ? "up" : "down",
        latencyMs: result.latencyMs ?? Date.now() - start,
        error: result.error,
      };
    } catch (error) {
      return {
        name: "coolify-worker",
        status: "down",
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : "unknown",
      };
    }
  }

  private async checkMinIO(): Promise<HealthCheck> {
    const result = await this.s3Storage.healthCheck();
    return {
      name: "minio",
      status: result.status,
      latencyMs: result.latencyMs,
      error: result.error,
    };
  }

  /**
   * Health check для конкретного сайта
   * GET /sites/:siteId/health?tenantId=xxx
   *
   * Если передан tenantId — проверяет что сайт принадлежит тенанту (tenant-safe).
   * Если tenantId не передан — работает как internal monitoring (без tenant isolation).
   *
   * Проверяет:
   * - Существование сайта в БД (+ принадлежность тенанту если указан)
   * - Наличие статики в MinIO
   * - HTTP доступность (если опубликован)
   */
  @Get("sites/:siteId/health")
  async siteHealth(
    @Param("siteId") siteId: string,
    @Query("tenantId") tenantId?: string,
  ) {
    const start = Date.now();

    try {
      // 1. Проверяем существование сайта в БД
      // Если передан tenantId — используем tenant-safe метод
      const site = tenantId
        ? await this.sitesService.get(tenantId, siteId)
        : await this.sitesService.getById(siteId);

      if (!site) {
        return {
          siteId,
          tenantId: tenantId ?? null,
          available: false,
          status: "not_found",
          error: tenantId
            ? "Site not found or does not belong to tenant"
            : "Site not found in database",
          timestamp: new Date().toISOString(),
        };
      }

      // 2. Проверяем статику в MinIO
      let staticCheck = {
        exists: false,
        hasIndex: false,
        fileCount: 0,
        totalSize: 0,
      };

      if (site.publicUrl) {
        const prefix = this.s3Storage.getSitePrefixBySubdomain(site.publicUrl);
        staticCheck = await this.s3Storage.checkSiteFiles(prefix);
      }

      // 3. Проверяем HTTP доступность (если опубликован)
      let httpCheck = {
        status: 0,
        latencyMs: 0,
        available: false,
      };

      if (site.publicUrl && site.status === "published") {
        const httpStart = Date.now();
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          const response = await fetch(site.publicUrl, {
            method: "HEAD",
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          httpCheck = {
            status: response.status,
            latencyMs: Date.now() - httpStart,
            available: response.ok,
          };
        } catch (e) {
          httpCheck = {
            status: 0,
            latencyMs: Date.now() - httpStart,
            available: false,
          };
        }
      }

      // 4. Определяем итоговый статус
      const isAvailable =
        site.status === "published" &&
        staticCheck.hasIndex &&
        (httpCheck.available || !site.publicUrl);

      return {
        siteId,
        available: isAvailable,
        status: site.status,
        publicUrl: site.publicUrl,
        checks: {
          database: { exists: true, status: site.status },
          static: staticCheck,
          http: httpCheck,
        },
        latencyMs: Date.now() - start,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Site health check failed for ${siteId}: ${error}`);
      return {
        siteId,
        available: false,
        status: "error",
        error: error instanceof Error ? error.message : "unknown",
        latencyMs: Date.now() - start,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Bulk health check всех сайтов тенанта
   * GET /tenants/:tenantId/sites/health
   *
   * Возвращает статус всех сайтов тенанта:
   * - Общая статистика (total, healthy, unhealthy)
   * - Детальный статус каждого сайта
   */
  @Get("tenants/:tenantId/sites/health")
  async tenantSitesHealth(@Param("tenantId") tenantId: string) {
    try {
      const result = await this.sitesService.healthCheckAll(tenantId);
      return {
        success: true,
        tenantId,
        timestamp: new Date().toISOString(),
        ...result,
      };
    } catch (error) {
      this.logger.error(`Tenant sites health check failed: ${error}`);
      return {
        success: false,
        tenantId,
        error: error instanceof Error ? error.message : "unknown",
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Запуск миграции orphaned sites
   * POST /migrate-orphaned
   *
   * Очищает mock кэш и создаёт реальные Coolify приложения
   * для сайтов без publicUrl или coolifyProjectUuid
   */
  @Post("migrate-orphaned")
  async migrateOrphaned() {
    this.logger.log("Starting orphaned sites migration via HTTP");
    try {
      const result = await this.sitesService.migrateOrphanedSites();
      return {
        success: true,
        ...result,
      };
    } catch (error) {
      this.logger.error(`Migration failed: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : "unknown",
      };
    }
  }

  /**
   * Диагностика состояния сайтов
   * GET /sites-debug
   */
  @Get("sites-debug")
  async sitesDebug() {
    return this.sitesService.debugSitesState();
  }

  /**
   * Массовая регенерация всех сайтов с указанным шаблоном
   * POST /regenerate-all?template=rose
   *
   * Регенерирует все активные сайты с принудительным использованием
   * указанного шаблона (по умолчанию 'rose').
   */
  @Post("regenerate-all")
  async regenerateAll(@Query("template") template?: string) {
    const templateId = template || "rose";
    this.logger.log(`Starting bulk regeneration with template: ${templateId}`);

    try {
      const result = await this.sitesService.regenerateAllWithTemplate(
        templateId,
      );
      return {
        success: true,
        ...result,
      };
    } catch (error) {
      this.logger.error(`Bulk regeneration failed: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : "unknown",
      };
    }
  }
}

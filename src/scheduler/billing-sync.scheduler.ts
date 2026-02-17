import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  PG_CONNECTION,
  BILLING_RMQ_SERVICE,
  USER_RMQ_SERVICE,
} from "../constants";
import * as schema from "../db/schema";
import { and, eq, sql } from "drizzle-orm";
import { ClientProxy } from "@nestjs/microservices";
import { SitesDomainService } from "../sites.service";
import { S3StorageService } from "../storage/s3.service";
import { SiteGeneratorService } from "../generator/generator.service";

@Injectable()
export class BillingSyncScheduler implements OnModuleInit {
  private readonly logger = new Logger(BillingSyncScheduler.name);

  constructor(
    @Inject(PG_CONNECTION) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(BILLING_RMQ_SERVICE) private readonly billingClient: ClientProxy,
    @Inject(USER_RMQ_SERVICE) private readonly userClient: ClientProxy,
    private readonly sites: SitesDomainService,
    private readonly storage: S3StorageService,
    private readonly generator: SiteGeneratorService,
  ) {}

  /**
   * Запускает синхронизацию при старте сервиса для быстрого восстановления.
   */
  async onModuleInit() {
    // Отложенный запуск чтобы дать сервисам время на инициализацию
    setTimeout(() => {
      this.logger.log("Running initial billing sync on startup...");
      this.reconcileBilling().catch((e) => {
        this.logger.warn(
          `Initial billing sync failed: ${e instanceof Error ? e.message : e}`,
        );
      });
    }, 10000); // 10 секунд после старта
  }

  private rpc<T = any>(
    client: ClientProxy,
    pattern: string,
    data: any,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const sub = client.send<T, any>(pattern, data).subscribe({
        next: (v) => resolve(v),
        error: (e) => reject(e),
        complete: () => sub.unsubscribe(),
      });
    });
  }

  /**
   * Синхронизация billing status каждые 5 минут для быстрого восстановления.
   * Если event-based синхронизация не сработала, cron подхватит изменения.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconcileBilling() {
    if (
      (process.env.BILLING_SYNC_CRON_ENABLED ?? "true").toLowerCase() ===
      "false"
    ) {
      return;
    }
    this.logger.log("Billing sync cron: start");
    try {
      // Соберём уникальные tenantId, у которых есть активные сайты (не удалены)
      const rows = await this.db
        .select({ tenantId: schema.site.tenantId })
        .from(schema.site)
        .where(sql`${schema.site.deletedAt} IS NULL`);
      const tenantIds = Array.from(
        new Set(rows.map((r) => r.tenantId).filter(Boolean)),
      );

      for (const tenantId of tenantIds) {
        try {
          const userRes: any = await this.rpc(
            this.userClient,
            "user.get_tenant_billing_account",
            { tenantId },
          );
          const accountId: string | undefined = userRes?.accountId ?? undefined;
          if (!accountId) {
            this.logger.warn(
              `Billing cron: no billing account for tenant ${tenantId}`,
            );
            continue;
          }
          const entitlements: any = await this.rpc(
            this.billingClient,
            "billing.get_entitlements",
            { accountId },
          );
          if (!entitlements?.success) continue;
          const frozen = Boolean(
            entitlements.frozen || entitlements.hasOpenInvoice,
          );
          if (frozen) {
            const res = await this.sites.freezeTenant(tenantId);
            this.logger.debug(
              `Billing cron: froze tenant ${tenantId} (affected=${res.affected})`,
            );
          } else {
            const res = await this.sites.unfreezeTenant(tenantId);
            this.logger.debug(
              `Billing cron: unfroze tenant ${tenantId} (affected=${res.affected})`,
            );
          }
        } catch (e) {
          this.logger.warn(
            `Billing cron: failed for tenant ${tenantId}: ${e instanceof Error ? e.message : e}`,
          );
        }
      }
    } catch (e) {
      this.logger.warn(
        `Billing sync cron failed: ${e instanceof Error ? e.message : e}`,
      );
    }

    // После синхронизации freeze/unfreeze — проверяем статику для активных сайтов
    await this.ensureStaticContent();

    this.logger.log("Billing sync cron: done");
  }

  /**
   * Проверить наличие статики для published сайтов и сгенерировать если нет.
   * Гарантирует что сайты с активной подпиской имеют рабочую статику.
   */
  private async ensureStaticContent() {
    try {
      // Получаем все published сайты с publicUrl
      const publishedSites = await this.db
        .select({
          id: schema.site.id,
          tenantId: schema.site.tenantId,
          publicUrl: schema.site.publicUrl,
        })
        .from(schema.site)
        .where(
          and(
            eq(schema.site.status, "published"),
            sql`${schema.site.deletedAt} IS NULL`,
            sql`${schema.site.publicUrl} IS NOT NULL`,
          ),
        );

      if (publishedSites.length === 0) return;

      this.logger.log(
        `Checking static content for ${publishedSites.length} published sites`,
      );

      for (const site of publishedSites) {
        try {
          if (!site.publicUrl) continue;

          // Проверяем наличие index.html в S3
          const prefix = this.storage.getSitePrefixBySubdomain(site.publicUrl);
          const check = await this.storage.checkSiteFiles(prefix);

          if (!check.hasIndex) {
            this.logger.log(
              `Site ${site.id} has no static content, triggering build...`,
            );

            await this.generator.build({
              tenantId: site.tenantId,
              siteId: site.id,
              mode: "production",
            });

            this.logger.log(`Built static content for site ${site.id}`);
          }
        } catch (e) {
          this.logger.warn(
            `Failed to check/build site ${site.id}: ${e instanceof Error ? e.message : e}`,
          );
        }
      }
    } catch (e) {
      this.logger.warn(
        `ensureStaticContent failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }
}

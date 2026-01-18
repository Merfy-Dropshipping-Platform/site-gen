import { Inject, Injectable, Logger } from "@nestjs/common";
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

@Injectable()
export class BillingSyncScheduler {
  private readonly logger = new Logger(BillingSyncScheduler.name);

  constructor(
    @Inject(PG_CONNECTION) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(BILLING_RMQ_SERVICE) private readonly billingClient: ClientProxy,
    @Inject(USER_RMQ_SERVICE) private readonly userClient: ClientProxy,
    private readonly sites: SitesDomainService,
  ) {}

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

  @Cron(CronExpression.EVERY_HOUR)
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
    } finally {
      this.logger.log("Billing sync cron: done");
    }
  }
}

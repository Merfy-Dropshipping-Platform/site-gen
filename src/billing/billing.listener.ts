/**
 * BillingListenerController
 *
 * Подписывается на события `billing.subscription.updated`.
 *
 * Обрабатывает:
 * - Заморозку/разморозку сайтов при изменении статуса подписки
 * - Проверку лимита сайтов при downgrade тарифа
 */
import { Controller, Inject, Logger } from "@nestjs/common";
import { Ctx, EventPattern, Payload, RmqContext } from "@nestjs/microservices";
import { ClientProxy } from "@nestjs/microservices";
import { USER_RMQ_SERVICE } from "../constants";
import { SitesDomainService } from "../sites.service";

interface SubscriptionUpdatedPayload {
  accountId?: string;
  tenantId?: string;
  status?: string;
  previousStatus?: string;
  shopsLimit?: number;
  planName?: string;
}

@Controller()
export class BillingListenerController {
  private readonly logger = new Logger(BillingListenerController.name);
  constructor(
    @Inject(USER_RMQ_SERVICE) private readonly userClient: ClientProxy,
    private readonly sites: SitesDomainService,
  ) {}

  @EventPattern("billing.subscription.updated")
  async handleSubscriptionUpdated(
    @Payload() payload: SubscriptionUpdatedPayload,
    @Ctx() _ctx: RmqContext,
  ) {
    try {
      // Получаем tenantId из payload или через user service
      let tenantId = payload?.tenantId;

      if (!tenantId && payload?.accountId) {
        // Map accountId -> organizationId (tenantId)
        const res: any = await new Promise((resolve, reject) => {
          const sub = this.userClient
            .send("user.get_active_organization", {
              accountId: payload.accountId,
            })
            .subscribe({
              next: (v) => resolve(v),
              error: reject,
              complete: () => sub.unsubscribe(),
            });
        });
        tenantId = res?.organizationId ?? undefined;
      }

      if (!tenantId) {
        this.logger.warn(
          "billing.subscription.updated: cannot determine tenantId",
        );
        return;
      }

      const status = String(payload?.status ?? "").toLowerCase();
      const previousStatus = String(
        payload?.previousStatus ?? "",
      ).toLowerCase();

      // 1. Обработка заморозки/разморозки
      const shouldFreeze = ["past_due", "frozen", "canceled"].includes(status);
      const wasFreeze = ["past_due", "frozen", "canceled"].includes(
        previousStatus,
      );

      if (shouldFreeze && !wasFreeze) {
        const result = await this.sites.freezeTenant(tenantId);
        this.logger.log(
          `Tenant ${tenantId} frozen by billing update (status=${status}), affected=${result.affected}`,
        );
      } else if (!shouldFreeze && wasFreeze) {
        const result = await this.sites.unfreezeTenant(tenantId);
        this.logger.log(
          `Tenant ${tenantId} unfrozen by billing update (status=${status}), affected=${result.affected}`,
        );
      }

      // 2. Проверка лимита сайтов при downgrade
      if (payload?.shopsLimit !== undefined) {
        await this.checkSitesLimit(
          tenantId,
          payload.shopsLimit,
          payload.planName,
        );
      }
    } catch (e) {
      this.logger.warn(
        `Failed to process billing.subscription.updated: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  /**
   * Проверяет, не превышен ли лимит сайтов после изменения тарифа.
   * При превышении логирует предупреждение — архивация требует действия пользователя.
   */
  private async checkSitesLimit(
    tenantId: string,
    newLimit: number,
    planName?: string,
  ) {
    try {
      const { items } = await this.sites.list(tenantId);
      const activeSites = items.filter((s) => s.status !== "archived");

      if (activeSites.length > newLimit) {
        this.logger.warn(
          `Tenant ${tenantId} has ${activeSites.length} active sites but plan ${planName || "unknown"} allows only ${newLimit}. ` +
            `User needs to archive ${activeSites.length - newLimit} site(s).`,
        );
        // TODO: Отправить уведомление пользователю через notification service
        // this.events.emit('sites.limit.exceeded', { tenantId, currentCount: activeSites.length, limit: newLimit });
      }
    } catch (e) {
      this.logger.warn(
        `Failed to check sites limit for tenant ${tenantId}: ${e instanceof Error ? e.message : e}`,
      );
    }
  }
}

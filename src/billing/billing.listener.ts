/**
 * BillingListenerController
 *
 * Подписывается на события `billing.subscription.updated`.
 * На текущем этапе — только логирует полезную нагрузку. Заморозка/разморозка
 * сайтов выполняется из gateway (эндпоинт entitlements), чтобы использовать
 * самый свежий снимок статуса биллинга и не дублировать бизнес‑логику здесь.
 */
import { Controller, Inject, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { ClientProxy } from '@nestjs/microservices';
import { USER_RMQ_SERVICE } from '../constants';
import { SitesDomainService } from '../sites.service';

@Controller()
export class BillingListenerController {
  private readonly logger = new Logger(BillingListenerController.name);
  constructor(
    @Inject(USER_RMQ_SERVICE) private readonly userClient: ClientProxy,
    private readonly sites: SitesDomainService,
  ) {}

  @EventPattern('billing.subscription.updated')
  async handleSubscriptionUpdated(@Payload() payload: any, @Ctx() _ctx: RmqContext) {
    try {
      if (!payload?.accountId) {
        this.logger.warn('billing.subscription.updated without accountId');
        return;
      }
      // Map accountId -> organizationId (tenantId)
      const res: any = await new Promise((resolve, reject) => {
        const sub = this.userClient.send('user.get_active_organization', { accountId: payload.accountId }).subscribe({
          next: (v) => resolve(v),
          error: reject,
          complete: () => sub.unsubscribe(),
        });
      });
      const tenantId: string | undefined = res?.organizationId ?? undefined;
      if (!tenantId) {
        this.logger.warn(`No organization for accountId=${payload.accountId}`);
        return;
      }
      const status = String(payload?.status ?? '').toLowerCase();
      const shouldFreeze = status === 'past_due' || status === 'frozen' || status === 'canceled';
      if (shouldFreeze) {
        const result = await this.sites.freezeTenant(tenantId);
        this.logger.log(`Tenant ${tenantId} frozen by billing update (status=${status}), affected=${result.affected}`);
      } else {
        const result = await this.sites.unfreezeTenant(tenantId);
        this.logger.log(`Tenant ${tenantId} unfrozen by billing update (status=${status}), affected=${result.affected}`);
      }
    } catch (e) {
      this.logger.warn(`Failed to process billing.subscription.updated: ${e instanceof Error ? e.message : e}`);
    }
  }
}

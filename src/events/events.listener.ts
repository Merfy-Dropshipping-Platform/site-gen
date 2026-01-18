/**
 * SitesEventsListenerController
 *
 * Best-effort доменные события публикуются в ту же очередь `sites_queue`.
 * Чтобы RabbitMQ не ругался на отсутствие подписчиков, держим no-op
 * обработчики для всех внутренних событий (логика может появиться позже).
 */
import { Controller, Logger } from "@nestjs/common";
import { EventPattern, Payload } from "@nestjs/microservices";

@Controller()
export class SitesEventsListenerController {
  private readonly logger = new Logger(SitesEventsListenerController.name);

  private drop(pattern: string, payload: any) {
    // Debug-лог показывает, что событие было получено и подтверждено
    this.logger.debug(`Ack ${pattern}: ${JSON.stringify(payload)}`);
  }

  @EventPattern("sites.site.created")
  handleSiteCreated(@Payload() payload: any) {
    this.drop("sites.site.created", payload);
  }

  @EventPattern("sites.site.updated")
  handleSiteUpdated(@Payload() payload: any) {
    this.drop("sites.site.updated", payload);
  }

  @EventPattern("sites.site.deleted")
  handleSiteDeleted(@Payload() payload: any) {
    this.drop("sites.site.deleted", payload);
  }

  @EventPattern("sites.site.published")
  handleSitePublished(@Payload() payload: any) {
    this.drop("sites.site.published", payload);
  }

  @EventPattern("sites.domain.attached")
  handleDomainAttached(@Payload() payload: any) {
    this.drop("sites.domain.attached", payload);
  }

  @EventPattern("sites.domain.verified")
  handleDomainVerified(@Payload() payload: any) {
    this.drop("sites.domain.verified", payload);
  }

  @EventPattern("sites.tenant.frozen")
  handleTenantFrozen(@Payload() payload: any) {
    this.drop("sites.tenant.frozen", payload);
  }

  @EventPattern("sites.tenant.unfrozen")
  handleTenantUnfrozen(@Payload() payload: any) {
    this.drop("sites.tenant.unfrozen", payload);
  }
}

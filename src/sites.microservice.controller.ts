/**
 * RMQ‑контроллер микросервиса «Сайты».
 *
 * Обрабатывает паттерны сообщений:
 * - sites.create_site, sites.get_site, sites.list
 * - sites.update_site, sites.delete_site
 * - sites.attach_domain, sites.verify_domain
 * - sites.freeze_tenant, sites.unfreeze_tenant
 * - sites.check_availability, sites.health_check
 */
import { Controller, Logger } from '@nestjs/common';
import { Ctx, MessagePattern, Payload, RmqContext } from '@nestjs/microservices';
import { SitesDomainService } from './sites.service';

@Controller()
export class SitesMicroserviceController {
  private readonly logger = new Logger(SitesMicroserviceController.name);
  constructor(private readonly service: SitesDomainService) {}

  @MessagePattern('sites.create_site')
  async createSite(@Payload() data: any, @Ctx() _ctx: RmqContext) {
    try {
      this.logger.log(`create_site request: ${JSON.stringify(data)}`);
      const { tenantId, actorUserId, name, slug, companyName } = data ?? {};
      if (!tenantId || !actorUserId || !name) {
        return { success: false, message: 'tenantId, actorUserId and name are required' };
      }
      const result = await this.service.create({ tenantId, actorUserId, name, slug, companyName });
      return { success: true, siteId: result.id, publicUrl: result.publicUrl };
    } catch (e: any) {
      this.logger.error('create_site failed', e);
      return { success: false, message: e?.message ?? 'internal_error' };
    }
  }

  @MessagePattern('sites.get_site')
  async getSite(@Payload() data: any) {
    try {
      this.logger.log(`get_site request: ${JSON.stringify(data)}`);
      const { tenantId, siteId } = data ?? {};
      if (!tenantId || !siteId) return { success: false, message: 'tenantId and siteId are required' };
      const site = await this.service.get(tenantId, siteId);
      return { success: true, site };
    } catch (e: any) {
      this.logger.error('get_site failed', e);
      return { success: false, message: e?.message ?? 'internal_error' };
    }
  }

  @MessagePattern('sites.get_site_by_slug')
  async getSiteBySlug(@Payload() data: any) {
    try {
      this.logger.log(`get_site_by_slug request: ${JSON.stringify(data)}`);
      const { slug } = data ?? {};
      if (!slug) return { success: false, message: 'slug is required' };
      const site = await this.service.getBySlug(slug);
      if (!site) return { success: false, message: 'not_found' };
      return { success: true, site };
    } catch (e: any) {
      this.logger.error('get_site_by_slug failed', e);
      return { success: false, message: e?.message ?? 'internal_error' };
    }
  }

  /**
   * Публичный endpoint для получения магазина по ID (для orders/storefront)
   * Не требует tenantId - используется для создания корзины покупателем
   */
  @MessagePattern('sites.get_shop')
  async getShop(@Payload() data: any) {
    try {
      this.logger.log(`get_shop request: ${JSON.stringify(data)}`);
      const { siteId } = data ?? {};
      if (!siteId) return { success: false, message: 'siteId is required' };
      const site = await this.service.getById(siteId);
      if (!site) return { success: false, message: 'not_found' };
      return { success: true, data: site };
    } catch (e: any) {
      this.logger.error('get_shop failed', e);
      return { success: false, message: e?.message ?? 'internal_error' };
    }
  }

  @MessagePattern('sites.list')
  async listSites(@Payload() data: any) {
    try {
      this.logger.log(`Received sites.list message: ${JSON.stringify(data)}`);
      const { tenantId, cursor, limit } = data ?? {};
      if (!tenantId) {
        this.logger.warn('sites.list request without tenantId');
        return { success: false, message: 'tenantId required' };
      }
      const result = await this.service.list(tenantId, limit, cursor);
      this.logger.log(`Returning sites.list result: ${result.items?.length ?? 0} items`);
      return { success: true, ...result };
    } catch (e: any) {
      this.logger.error('sites.list failed', e);
      return { success: false, message: e?.message ?? 'internal_error' };
    }
  }

  @MessagePattern('sites.update_site')
  async updateSite(@Payload() data: any) {
    try {
      const { tenantId, siteId, patch, actorUserId } = data ?? {};
      if (!tenantId || !siteId) return { success: false, message: 'tenantId and siteId required' };
      const ok = await this.service.update({ tenantId, siteId, patch: patch ?? {}, actorUserId });
      return { success: ok };
    } catch (e: any) {
      this.logger.error('update_site failed', e);
      return { success: false, message: e?.message ?? 'internal_error' };
    }
  }

  @MessagePattern('sites.delete_site')
  async deleteSite(@Payload() data: any) {
    try {
      const { tenantId, siteId, hard } = data ?? {};
      if (!tenantId || !siteId) return { success: false, message: 'tenantId and siteId required' };
      const ok = hard ? await this.service.hardDelete(tenantId, siteId) : await this.service.softDelete(tenantId, siteId);
      return { success: ok };
    } catch (e: any) {
      this.logger.error('delete_site failed', e);
      return { success: false, message: e?.message ?? 'internal_error' };
    }
  }

  @MessagePattern('sites.attach_domain')
  async attachDomain(@Payload() data: any) {
    try {
      const { tenantId, siteId, domain, actorUserId } = data ?? {};
      if (!tenantId || !siteId || !domain || !actorUserId) return { success: false, message: 'tenantId, siteId, domain, actorUserId required' };
      const res = await this.service.attachDomain({ tenantId, siteId, domain, actorUserId });
      return { success: true, ...res };
    } catch (e: any) {
      this.logger.error('attach_domain failed', e);
      return { success: false, message: e?.message ?? 'internal_error' };
    }
  }

  @MessagePattern('sites.verify_domain')
  async verifyDomain(@Payload() data: any) {
    try {
      const { tenantId, siteId, domain } = data ?? {};
      if (!tenantId || !siteId) return { success: false, message: 'tenantId and siteId required' };
      const ok = await this.service.verifyDomain({ tenantId, siteId, domain });
      return { success: ok };
    } catch (e: any) {
      this.logger.error('verify_domain failed', e);
      return { success: false, message: e?.message ?? 'internal_error' };
    }
  }

  @MessagePattern('sites.publish')
  async publish(@Payload() data: any) {
    try {
      const { tenantId, siteId, mode } = data ?? {};
      if (!tenantId || !siteId) return { success: false, message: 'tenantId and siteId required' };
      const res = await this.service.publish({ tenantId, siteId, mode });
      return { success: true, ...res };
    } catch (e: any) {
      this.logger.error('publish failed', e);
      return { success: false, message: e?.message ?? 'internal_error' };
    }
  }

  @MessagePattern('sites.freeze_tenant')
  async freeze(@Payload() data: any) {
    try {
      const { tenantId } = data ?? {};
      if (!tenantId) return { success: false, message: 'tenantId required' };
      const res = await this.service.freezeTenant(tenantId);
      return { success: true, ...res };
    } catch (e: any) {
      this.logger.error('freeze_tenant failed', e);
      return { success: false, message: e?.message ?? 'internal_error' };
    }
  }

  @MessagePattern('sites.unfreeze_tenant')
  async unfreeze(@Payload() data: any) {
    try {
      const { tenantId } = data ?? {};
      if (!tenantId) return { success: false, message: 'tenantId required' };
      const res = await this.service.unfreezeTenant(tenantId);
      return { success: true, ...res };
    } catch (e: any) {
      this.logger.error('unfreeze_tenant failed', e);
      return { success: false, message: e?.message ?? 'internal_error' };
    }
  }

  // Revisions
  @MessagePattern('sites.revisions.list')
  async listRevisions(@Payload() data: any) {
    try {
      const { tenantId, siteId, limit } = data ?? {};
      if (!tenantId || !siteId) return { success: false, message: 'tenantId and siteId required' };
      const res = await this.service.listRevisions(tenantId, siteId, limit ?? 50);
      return { success: true, ...res };
    } catch (e: any) {
      this.logger.error('revisions.list failed', e);
      return { success: false, message: e?.message ?? 'internal_error' };
    }
  }

  @MessagePattern('sites.revisions.create')
  async createRevision(@Payload() data: any) {
    try {
      const { tenantId, siteId, data: revData, meta, actorUserId, setCurrent } = data ?? {};
      if (!tenantId || !siteId) return { success: false, message: 'tenantId and siteId required' };
      const res = await this.service.createRevision({ tenantId, siteId, data: revData, meta, actorUserId, setCurrent });
      return { success: true, ...res };
    } catch (e: any) {
      this.logger.error('revisions.create failed', e);
      return { success: false, message: e?.message ?? 'internal_error' };
    }
  }

  @MessagePattern('sites.revisions.set_current')
  async setCurrentRevision(@Payload() data: any) {
    try {
      const { tenantId, siteId, revisionId } = data ?? {};
      if (!tenantId || !siteId || !revisionId) return { success: false, message: 'tenantId, siteId and revisionId required' };
      const res = await this.service.setCurrentRevision({ tenantId, siteId, revisionId });
      return res;
    } catch (e: any) {
      this.logger.error('revisions.set_current failed', e);
      return { success: false, message: e?.message ?? 'internal_error' };
    }
  }

  @MessagePattern('sites.check_availability')
  async checkAvailability(@Payload() data: any) {
    try {
      const { tenantId, siteId } = data ?? {};
      if (!tenantId || !siteId) {
        return { success: false, message: 'tenantId and siteId required' };
      }
      const result = await this.service.checkSiteAvailability(tenantId, siteId);
      return { success: true, ...result };
    } catch (e: any) {
      this.logger.error('check_availability failed', e);
      return { success: false, message: e?.message ?? 'internal_error' };
    }
  }

  /**
   * HTTP health check — делает GET запрос на publicUrl сайта.
   * Возвращает { available, statusCode, latencyMs }.
   */
  @MessagePattern('sites.health_check')
  async healthCheck(@Payload() data: any) {
    try {
      const { tenantId, siteId } = data ?? {};
      if (!tenantId || !siteId) {
        return { success: false, message: 'tenantId and siteId required' };
      }
      const result = await this.service.healthCheck(tenantId, siteId);
      return { success: true, ...result };
    } catch (e: any) {
      this.logger.error('health_check failed', e);
      return { success: false, message: e?.message ?? 'internal_error' };
    }
  }

  @MessagePattern('sites.migrate_orphaned')
  async migrateOrphaned() {
    try {
      this.logger.log('Starting orphaned sites migration');
      const result = await this.service.migrateOrphanedSites();
      return { success: true, ...result };
    } catch (e: any) {
      this.logger.error('migrate_orphaned failed', e);
      return { success: false, message: e?.message ?? 'internal_error' };
    }
  }
}

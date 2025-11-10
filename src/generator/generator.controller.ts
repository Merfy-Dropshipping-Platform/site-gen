/**
 * Контроллер RPC генератора.
 *
 * Паттерн: `sites.build` — запускает сборку артефакта сайта на основе последней (или переданной) ревизии.
 */
import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { SiteGeneratorService } from './generator.service';

@Controller()
export class GeneratorMicroserviceController {
  private readonly logger = new Logger(GeneratorMicroserviceController.name);
  constructor(private readonly generator: SiteGeneratorService) {}

  // Single-queue consumption: pattern within sites_queue
  @MessagePattern('sites.build')
  async handleBuild(@Payload() data: any) {
    try {
      const { tenantId, siteId, mode } = data ?? {};
      if (!tenantId || !siteId) return { success: false, message: 'tenantId and siteId required' };
      const res = await this.generator.build({ tenantId, siteId, mode });
      return { success: true, ...res };
    } catch (e: any) {
      this.logger.error('build failed', e);
      return { success: false, message: e?.message ?? 'internal_error' };
    }
  }
}

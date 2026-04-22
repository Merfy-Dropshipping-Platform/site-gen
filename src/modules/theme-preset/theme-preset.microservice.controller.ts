/**
 * RabbitMQ microservice endpoints — same operations over RMQ (for api-gateway).
 *
 * Patterns:
 *   - theme-presets.list
 *   - theme-presets.get       { id }
 *   - theme-presets.apply     { siteId, presetId, replaceContent?, actorId? }
 */
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import { ThemePresetService } from './theme-preset.service';

@Controller()
export class ThemePresetMicroserviceController {
  constructor(private readonly presets: ThemePresetService) {}

  @MessagePattern('theme-presets.list')
  async list() {
    return this.presets.list();
  }

  @MessagePattern('theme-presets.get')
  async get(@Payload() payload: { id: string }) {
    return this.presets.get(payload.id);
  }

  @MessagePattern('theme-presets.apply')
  async apply(
    @Payload()
    payload: {
      siteId: string;
      presetId: string;
      replaceContent?: boolean;
      actorId?: string;
    },
  ) {
    return this.presets.applyToSite(payload.siteId, payload.presetId, {
      replaceContent: payload.replaceContent,
      actorId: payload.actorId,
    });
  }
}

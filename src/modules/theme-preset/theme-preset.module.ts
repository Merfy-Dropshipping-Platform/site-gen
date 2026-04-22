import { Module, OnApplicationBootstrap, Logger } from '@nestjs/common';

import { ThemePresetController } from './theme-preset.controller';
import { ThemePresetMicroserviceController } from './theme-preset.microservice.controller';
import { ThemePresetService } from './theme-preset.service';

@Module({
  controllers: [ThemePresetController, ThemePresetMicroserviceController],
  providers: [ThemePresetService],
  exports: [ThemePresetService],
})
export class ThemePresetModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(ThemePresetModule.name);

  constructor(private readonly presets: ThemePresetService) {}

  async onApplicationBootstrap() {
    // Skip auto-seed in test env — tests control seed explicitly.
    if (process.env.NODE_ENV === 'test') return;
    // Opt-out via env var for sensitive deployments.
    if (process.env.SKIP_THEME_PRESET_SEED === 'true') {
      this.logger.log('SKIP_THEME_PRESET_SEED=true — skipping preset seed');
      return;
    }
    try {
      const r = await this.presets.seedFromFiles();
      this.logger.log(
        `Preset seed: loaded=${r.loaded} skipped=${r.skipped.length} errors=${r.errors.length}`,
      );
      for (const e of r.errors) this.logger.warn(`  ${e}`);
    } catch (err) {
      this.logger.error('Preset seed failed', err as Error);
    }
  }
}

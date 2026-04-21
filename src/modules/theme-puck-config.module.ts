import { Module } from '@nestjs/common';
import { ThemePuckConfigController } from '../controllers/theme-puck-config.controller';

/**
 * ThemePuckConfigModule — Phase 1c Task 3a (revised).
 *
 * Exposes GET /api/themes/:themeId/puck-config which returns the Puck editor
 * config as JSON (render functions stripped). Consumed by the constructor
 * sub-repo via `puckConfigResolver.ts` which re-attaches React render
 * (AstroBlockBridge) client-side.
 */
@Module({
  controllers: [ThemePuckConfigController],
})
export class ThemePuckConfigModule {}

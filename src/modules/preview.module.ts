import { Module } from '@nestjs/common';
import { PreviewController } from '../controllers/preview.controller';
import { PreviewService } from '../services/preview.service';
import { DatabaseModule } from '../db/database.module';

/**
 * PreviewModule — wires the HTTP preview endpoint (Phase 0 pilot for
 * Astro Container–driven constructor/live parity, Task 21 of 078). Imports
 * DatabaseModule so the controller can read `site` / `site_revision` for
 * real-content preview (Phase 1c).
 */
@Module({
  imports: [DatabaseModule],
  controllers: [PreviewController],
  providers: [PreviewService],
  exports: [PreviewService],
})
export class PreviewModule {}

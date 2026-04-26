import { Module } from '@nestjs/common';
import { PreviewController } from '../controllers/preview.controller';
import { PreviewService } from '../services/preview.service';
import { StorefrontDataController } from '../controllers/storefront-data.controller';
import { DatabaseModule } from '../db/database.module';
import { RabbitMQModule } from '../rabbitmq/rabbitmq.module';

/**
 * PreviewModule — wires the HTTP preview endpoint (Phase 0 pilot for
 * Astro Container–driven constructor/live parity, Task 21 of 078). Imports
 * DatabaseModule so the controller can read `site` / `site_revision` for
 * real-content preview (Phase 1c).
 *
 * Also hosts the public storefront-data endpoint that the Catalog block
 * inline script calls to fetch products+collections for the constructor
 * preview (mirroring live storefront).
 */
@Module({
  imports: [DatabaseModule, RabbitMQModule],
  controllers: [PreviewController, StorefrontDataController],
  providers: [PreviewService],
  exports: [PreviewService],
})
export class PreviewModule {}

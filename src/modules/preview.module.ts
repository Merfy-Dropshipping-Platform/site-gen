import { Module } from '@nestjs/common';
import { PreviewController } from '../controllers/preview.controller';
import { PreviewService } from '../services/preview.service';

/**
 * PreviewModule — wires the HTTP preview endpoint (Phase 0 pilot for
 * Astro Container–driven constructor/live parity, Task 21 of 078).
 */
@Module({
  controllers: [PreviewController],
  providers: [PreviewService],
  exports: [PreviewService],
})
export class PreviewModule {}

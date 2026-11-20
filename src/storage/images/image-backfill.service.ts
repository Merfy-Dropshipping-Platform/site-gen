import { Injectable, Logger } from "@nestjs/common";
import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { errorMessage, sleep } from "./async-utils";
import { ImageBackfill } from "./image-backfill";
import { backfillScheduleFrom } from "./image-config";
import { MediaImagesService } from "./media-images.service";

/** Запускает пережатие старых картинок медиа при старте и затем по расписанию. */
@Injectable()
export class ImageBackfillService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImageBackfillService.name);
  private stopped = false;

  constructor(private readonly images: MediaImagesService) {}

  onModuleInit(): void {
    const schedule = backfillScheduleFrom(process.env);
    if (!schedule.enabled) return;

    const backfill = new ImageBackfill(
      this.images.store,
      this.images.variants,
      this.images.lib,
      schedule.options,
    );
    this.logger.log(
      `Пережатие старых картинок включено: ${schedule.options.prefix}, проход раз в ${schedule.intervalMs / 60_000} мин`,
    );
    void this.loop(backfill, schedule.intervalMs);
  }

  onModuleDestroy(): void {
    this.stopped = true;
  }

  private async loop(backfill: ImageBackfill, intervalMs: number) {
    while (!this.stopped) {
      await this.pass(backfill);
      await sleep(intervalMs);
    }
  }

  private async pass(backfill: ImageBackfill): Promise<void> {
    try {
      const stats = await backfill.runPass(() => this.stopped);
      this.logger.log(`Проход пережатия: ${JSON.stringify(stats)}`);
    } catch (error) {
      this.logger.error(`Проход пережатия сорвался: ${errorMessage(error)}`);
    }
  }
}

import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PublicationsService } from "../publications/publications.service";

@Injectable()
export class PublicationsScheduler {
  private readonly logger = new Logger(PublicationsScheduler.name);

  constructor(private readonly publicationsService: PublicationsService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleScheduledPublications() {
    try {
      await this.publicationsService.publishScheduled();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Scheduled publications cron failed: ${msg}`);
    }
  }
}

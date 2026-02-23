/**
 * Build Queue Service — queues build messages to sites_queue with priority support.
 *
 * Used by:
 * - SitesDomainService.publish() — queues builds triggered by user action
 * - ProductUpdateListener — queues rebuilds triggered by product changes
 *
 * Publishes `sites.build_queued` messages to sites_queue via raw amqplib
 * to support x-max-priority routing (NestJS ClientProxy doesn't support priority).
 */
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as amqp from "amqp-connection-manager";
import type { ChannelWrapper } from "amqp-connection-manager";
import type { Channel } from "amqplib";
import { SITES_QUEUE } from "./retry-setup.service";

export interface QueueBuildParams {
  tenantId: string;
  siteId: string;
  buildId?: string;
  mode?: "draft" | "production";
  priority?: number;
  trigger?: string;
}

@Injectable()
export class BuildQueuePublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BuildQueuePublisher.name);
  private connection: amqp.AmqpConnectionManager | null = null;
  private channel: ChannelWrapper | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const rabbitmqUrl = this.config.get<string>("RABBITMQ_URL");
    if (!rabbitmqUrl) {
      this.logger.warn("RABBITMQ_URL not set, build queue publisher disabled");
      return;
    }

    this.connection = amqp.connect([rabbitmqUrl]);
    this.channel = this.connection.createChannel({
      setup: async (channel: Channel) => {
        // Do NOT assertQueue here — the queue is already created by the
        // NestJS microservice transport (without x-max-priority).
        // Asserting with different args causes PRECONDITION_FAILED which
        // closes the amqplib channel, breaking sendToQueue silently.
        await channel.checkQueue(SITES_QUEUE);
        this.logger.log(`Build queue publisher channel ready (queue: ${SITES_QUEUE})`);
      },
    });

    this.logger.log("Build queue publisher initialized");
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }

  /**
   * Queue a build message to sites_queue with priority support.
   *
   * @returns true if the message was published, false otherwise
   */
  async queueBuild(params: QueueBuildParams): Promise<boolean> {
    if (!this.channel) {
      this.logger.warn(
        "Build queue publisher not initialized, cannot queue build",
      );
      return false;
    }

    const priority = params.priority ?? 1;

    const message = {
      pattern: "sites.build_queued",
      data: {
        tenantId: params.tenantId,
        siteId: params.siteId,
        buildId: params.buildId,
        mode: params.mode ?? "production",
        trigger: params.trigger ?? "manual",
      },
    };

    try {
      await this.channel.sendToQueue(
        SITES_QUEUE,
        Buffer.from(JSON.stringify(message)),
        {
          persistent: true,
          priority,
        },
      );

      this.logger.log(
        `Build queued: site=${params.siteId}, priority=${priority}, trigger=${params.trigger ?? "manual"}`,
      );
      return true;
    } catch (err) {
      this.logger.error(
        `Failed to queue build for site ${params.siteId}: ${err instanceof Error ? err.message : err}`,
      );
      return false;
    }
  }
}

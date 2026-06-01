/**
 * ActivityLogPublisher
 *
 * Publishes envelopes into the `activity.events` topic exchange consumed
 * by the activity-log microservice. Best-effort: a broker outage or
 * unreachable exchange MUST NOT roll back the caller's business
 * transaction — failures are logged and swallowed.
 *
 * Envelope contract: mrf/activity-log/CONTRACT.md (schemaVersion=1, flat
 * envelope, routing key `<category>.<action>`, idempotent via eventId).
 *
 * We use amqp-connection-manager directly because NestJS ClientProxy
 * publishes to a queue by name, while activity-log uses a topic exchange.
 */
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import * as amqp from "amqp-connection-manager";
import type { ChannelWrapper } from "amqp-connection-manager";
import type { Channel } from "amqplib";

export type ActivitySeverity = "info" | "warning" | "critical" | "security";
export type ActivityActorType =
  | "user"
  | "system"
  | "webhook"
  | "cron"
  | "external";

export interface ActivityEnvelopeInput {
  sourceService: string;
  category: string;
  action: string;
  severity: ActivitySeverity;
  organizationId: string;
  siteId?: string | null;
  actorType: ActivityActorType;
  actorUserId?: string | null;
  objectType?: string;
  objectId?: string;
  objectRef?: string | null;
  payload?: {
    diff?: Record<string, unknown>;
    meta?: Record<string, unknown>;
  };
  eventId?: string;
  occurredAt?: string;
}

@Injectable()
export class ActivityLogPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ActivityLogPublisher.name);
  private readonly exchange: string;
  private connection: amqp.AmqpConnectionManager | null = null;
  private channel: ChannelWrapper | null = null;

  constructor(private readonly configService: ConfigService) {
    this.exchange =
      this.configService.get<string>("ACTIVITY_LOG_EXCHANGE") ??
      "activity.events";
  }

  async onModuleInit() {
    let rabbitmqUrl =
      process.env.NODE_ENV === "production"
        ? this.configService.get<string>("RABBITMQ_URL") ||
          this.configService.get<string>("RABBITMQ_URL_FIX")
        : this.configService.get<string>("RABBITMQ_URL_FIX") ||
          this.configService.get<string>("RABBITMQ_URL");
    if (process.env.NODE_ENV === "production" && rabbitmqUrl) {
      rabbitmqUrl = rabbitmqUrl.replace(":5673", ":5672");
    }
    if (!rabbitmqUrl) {
      this.logger.warn(
        "RABBITMQ_URL not set — activity-log publishing disabled",
      );
      return;
    }

    try {
      this.connection = amqp.connect([rabbitmqUrl]);
      this.connection.on("connect", () =>
        this.logger.log("ActivityLogPublisher connected"),
      );
      this.connection.on("disconnect", (params: { err?: Error }) =>
        this.logger.warn(
          `ActivityLogPublisher disconnected: ${params.err?.message ?? "unknown"}`,
        ),
      );

      this.channel = this.connection.createChannel({
        json: false,
        setup: async (ch: Channel) => {
          await ch.assertExchange(this.exchange, "topic", {
            durable: true,
            autoDelete: false,
          });
        },
      });
      await this.channel.waitForConnect();
    } catch (err) {
      this.logger.warn(
        `Failed to initialize ActivityLogPublisher: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async onModuleDestroy() {
    try {
      if (this.channel) await this.channel.close();
      if (this.connection) await this.connection.close();
    } catch (err) {
      this.logger.warn(
        `ActivityLogPublisher shutdown error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Fire-and-forget publish. Never throws — logs and swallows.
   */
  emit(input: ActivityEnvelopeInput): void {
    const eventId = input.eventId ?? randomUUID();
    const occurredAt = input.occurredAt ?? new Date().toISOString();
    const envelope = {
      schemaVersion: 1 as const,
      eventId,
      occurredAt,
      sourceService: input.sourceService,
      category: input.category,
      action: input.action,
      severity: input.severity,
      organizationId: input.organizationId,
      siteId: input.siteId ?? null,
      actorType: input.actorType,
      actorUserId: input.actorUserId ?? null,
      objectType: input.objectType,
      objectId: input.objectId,
      objectRef: input.objectRef ?? null,
      payload: input.payload,
    };
    const routingKey = `${input.category}.${input.action}`;

    if (!this.channel) {
      this.logger.warn(
        `activity-log channel not ready, dropping event ${eventId} (${routingKey})`,
      );
      return;
    }

    const publishPromise = this.channel.publish(
      this.exchange,
      routingKey,
      Buffer.from(JSON.stringify(envelope)),
      {
        deliveryMode: 2,
        contentType: "application/json",
        messageId: eventId,
        timestamp: Math.floor(Date.now() / 1000),
      },
    );

    let timeoutHandle: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error("activity-log publish timeout 2000ms")),
        2000,
      );
    });

    Promise.race([publishPromise, timeoutPromise])
      .catch((err) => {
        this.logger.warn(
          `activity-log publish failed (eventId=${eventId} routingKey=${routingKey}): ${err instanceof Error ? err.message : String(err)}`,
        );
      })
      .finally(() => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      });
  }
}

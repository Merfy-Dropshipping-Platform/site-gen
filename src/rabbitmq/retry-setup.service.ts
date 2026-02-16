/**
 * RabbitMQ DLX Retry Setup Service.
 *
 * Declares retry queues with TTL and dead letter exchanges on application startup:
 * - sites_build_retry_5s   (TTL 5000ms → routes back to sites_queue)
 * - sites_build_retry_30s  (TTL 30000ms → routes back to sites_queue)
 * - sites_build_retry_120s (TTL 120000ms → routes back to sites_queue)
 * - sites_build_dead_letter (final destination after 3 failed attempts)
 *
 * Flow: sites_queue → nack → retry_5s → sites_queue → nack → retry_30s → sites_queue → nack → retry_120s → sites_queue → nack → dead_letter
 */
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as amqplib from "amqplib";

/** Retry tier configuration */
interface RetryTier {
  queue: string;
  ttl: number;
}

export const RETRY_TIERS: RetryTier[] = [
  { queue: "sites_build_retry_5s", ttl: 5_000 },
  { queue: "sites_build_retry_30s", ttl: 30_000 },
  { queue: "sites_build_retry_120s", ttl: 120_000 },
];

export const DEAD_LETTER_QUEUE = "sites_build_dead_letter";
export const SITES_QUEUE = "sites_queue";
export const DLX_EXCHANGE = "sites_build_dlx";
export const MAX_RETRIES = 3;

@Injectable()
export class RetrySetupService implements OnModuleInit {
  private readonly logger = new Logger(RetrySetupService.name);

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const rabbitmqUrl = this.config.get<string>("RABBITMQ_URL");
    if (!rabbitmqUrl) {
      this.logger.warn("RABBITMQ_URL not set, skipping DLX retry setup");
      return;
    }

    try {
      await this.setupRetryInfrastructure(rabbitmqUrl);
      this.logger.log("DLX retry infrastructure setup complete");
    } catch (err) {
      this.logger.error(
        `Failed to setup DLX retry infrastructure: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private async setupRetryInfrastructure(rabbitmqUrl: string): Promise<void> {
    const conn = await amqplib.connect(rabbitmqUrl);
    const ch = await conn.createChannel();

    try {
      // 1. Declare the DLX exchange (direct type for routing)
      await ch.assertExchange(DLX_EXCHANGE, "direct", { durable: true });
      this.logger.log(`Exchange declared: ${DLX_EXCHANGE}`);

      // 2. Declare retry queues with TTL — messages expire and route back to sites_queue
      for (const tier of RETRY_TIERS) {
        await ch.assertQueue(tier.queue, {
          durable: true,
          arguments: {
            "x-message-ttl": tier.ttl,
            "x-dead-letter-exchange": "", // default exchange
            "x-dead-letter-routing-key": SITES_QUEUE, // route back to main queue
          },
        });
        // Bind retry queue to DLX exchange with routing key = queue name
        await ch.bindQueue(tier.queue, DLX_EXCHANGE, tier.queue);
        this.logger.log(
          `Retry queue declared: ${tier.queue} (TTL ${tier.ttl}ms)`,
        );
      }

      // 3. Declare dead letter queue (final destination)
      await ch.assertQueue(DEAD_LETTER_QUEUE, {
        durable: true,
      });
      await ch.bindQueue(DEAD_LETTER_QUEUE, DLX_EXCHANGE, DEAD_LETTER_QUEUE);
      this.logger.log(`Dead letter queue declared: ${DEAD_LETTER_QUEUE}`);

      // 4. Check sites_queue exists (do NOT change args — queue already declared by NestJS)
      // Attempting assertQueue with different args (e.g. x-max-priority) would crash the channel.
      // Use a separate channel with passive=true check instead.
      let ch2: amqplib.Channel | null = null;
      try {
        ch2 = await conn.createChannel();
        await ch2.checkQueue(SITES_QUEUE);
        this.logger.log(`Main queue verified: ${SITES_QUEUE}`);
      } catch {
        this.logger.warn(
          `${SITES_QUEUE} does not exist yet — will be created by NestJS microservice`,
        );
      } finally {
        try { await ch2?.close(); } catch { /* ignore */ }
      }
    } finally {
      await ch.close();
      await conn.close();
    }
  }
}

/**
 * Determine which retry queue to route a failed message to based on retry count.
 * Returns the routing key for the DLX exchange, or null if max retries exceeded.
 */
export function getRetryRoutingKey(retryCount: number): string | null {
  if (retryCount >= MAX_RETRIES) return null; // → dead letter
  if (retryCount < RETRY_TIERS.length) {
    return RETRY_TIERS[retryCount].queue;
  }
  return null; // exceeded tiers → dead letter
}

/**
 * Extract retry count from x-death headers (RabbitMQ automatic tracking).
 */
export function getRetryCountFromHeaders(
  properties: Record<string, unknown>,
): number {
  const headers = properties?.headers as Record<string, unknown> | undefined;
  if (!headers) return 0;

  const xDeath = headers["x-death"] as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(xDeath) || xDeath.length === 0) return 0;

  // Sum up all death counts across all retry queues
  let totalDeaths = 0;
  for (const entry of xDeath) {
    const count = Number(entry.count ?? 0);
    totalDeaths += count;
  }
  return totalDeaths;
}

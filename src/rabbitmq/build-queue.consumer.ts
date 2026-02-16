/**
 * Build Queue Consumer with DLX retry support.
 *
 * Consumes `sites.build` messages from sites_queue with:
 * - Priority-aware consumption (x-max-priority: 10)
 * - prefetchCount: 3 (max 3 concurrent builds)
 * - DLX retry on failure: nack → retry_5s → retry_30s → retry_120s → dead_letter
 * - x-death header tracking for retry count
 * - Build progress updates to DB during pipeline execution
 */
import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as amqplib from "amqplib";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { ClientProxy } from "@nestjs/microservices";
import {
  DLX_EXCHANGE,
  DEAD_LETTER_QUEUE,
  SITES_QUEUE,
  getRetryCountFromHeaders,
  getRetryRoutingKey,
} from "./retry-setup.service";
import { PG_CONNECTION, PRODUCT_RMQ_SERVICE } from "../constants";
import * as schema from "../db/schema";
import { runBuildPipeline, type BuildDependencies } from "../generator/build.service";
import { S3StorageService } from "../storage/s3.service";

const MAX_CONCURRENT_BUILDS = 3;

@Injectable()
export class BuildQueueConsumer implements OnModuleInit {
  private readonly logger = new Logger(BuildQueueConsumer.name);
  private connection: Awaited<ReturnType<typeof amqplib.connect>> | null = null;
  private channel: Awaited<ReturnType<Awaited<ReturnType<typeof amqplib.connect>>["createChannel"]>> | null = null;

  constructor(
    private readonly config: ConfigService,
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
    @Inject(PRODUCT_RMQ_SERVICE)
    private readonly productClient: ClientProxy,
    private readonly s3: S3StorageService,
  ) {}

  async onModuleInit(): Promise<void> {
    const enabled =
      (this.config.get<string>("BUILD_QUEUE_CONSUMER_ENABLED") ?? "false").toLowerCase() === "true";

    if (!enabled) {
      this.logger.log("Build queue consumer disabled (BUILD_QUEUE_CONSUMER_ENABLED != true)");
      return;
    }

    const rabbitmqUrl = this.config.get<string>("RABBITMQ_URL");
    if (!rabbitmqUrl) {
      this.logger.warn("RABBITMQ_URL not set, skipping build queue consumer");
      return;
    }

    try {
      await this.startConsuming(rabbitmqUrl);
    } catch (err) {
      this.logger.error(
        `Failed to start build queue consumer: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private async startConsuming(rabbitmqUrl: string): Promise<void> {
    this.connection = await amqplib.connect(rabbitmqUrl);
    this.channel = await this.connection.createChannel();

    // Limit concurrent builds
    await this.channel.prefetch(MAX_CONCURRENT_BUILDS);

    // Ensure queue exists (idempotent)
    try {
      await this.channel.assertQueue(SITES_QUEUE, {
        durable: true,
        arguments: { "x-max-priority": 10 },
      });
    } catch {
      this.logger.warn(
        "Could not assert sites_queue with priority — may already exist with different args",
      );
      // Reconnect since assertQueue failure closes the channel
      this.channel = await this.connection.createChannel();
      await this.channel.prefetch(MAX_CONCURRENT_BUILDS);
    }

    this.logger.log(
      `Build queue consumer started (prefetch: ${MAX_CONCURRENT_BUILDS})`,
    );

    await this.channel.consume(
      SITES_QUEUE,
      async (msg) => {
        if (!msg) return;

        const content = msg.content.toString();
        let data: Record<string, unknown>;

        try {
          data = JSON.parse(content);
        } catch {
          this.logger.warn("Invalid JSON in message, acking to discard");
          this.channel?.ack(msg);
          return;
        }

        // Only handle build pattern messages
        const pattern = data.pattern as string | undefined;
        if (pattern !== "sites.build_queued") {
          // Not a build message — let NestJS RPC handle it via its own consumer
          // We nack without requeue so it goes back to the queue for other consumers
          // Actually, we should NOT consume these — this consumer only handles build_queued
          this.channel?.nack(msg, false, true); // requeue for NestJS
          return;
        }

        const payload = data.data as Record<string, unknown> | undefined;
        if (!payload) {
          this.logger.warn("build_queued message without data, acking to discard");
          this.channel?.ack(msg);
          return;
        }

        const retryCount = getRetryCountFromHeaders(msg.properties as unknown as Record<string, unknown>);
        const { tenantId, siteId, buildId, mode } = payload as {
          tenantId?: string;
          siteId?: string;
          buildId?: string;
          mode?: string;
        };

        if (!tenantId || !siteId) {
          this.logger.warn("build_queued missing tenantId/siteId, discarding");
          this.channel?.ack(msg);
          return;
        }

        this.logger.log(
          `Processing build: site=${siteId}, retry=${retryCount}, priority=${msg.properties.priority ?? "default"}`,
        );

        try {
          // Update retry count in DB
          if (buildId) {
            await this.db
              .update(schema.siteBuild)
              .set({ retryCount, startedAt: new Date() })
              .where(eq(schema.siteBuild.id, buildId));
          }

          const deps: BuildDependencies = {
            db: this.db,
            schema,
            productClient: this.productClient,
            s3: this.s3,
            eventsEmit: (eventPattern, eventPayload) => {
              // Update build progress in DB
              const p = eventPayload as {
                buildId?: string;
                stage?: string;
                percent?: number;
                message?: string;
              };
              if (p.buildId) {
                this.db
                  .update(schema.siteBuild)
                  .set({
                    stage: p.stage,
                    percent: p.percent,
                    message: p.message,
                  })
                  .where(eq(schema.siteBuild.id, p.buildId))
                  .catch((e) =>
                    this.logger.warn(`Failed to update build progress: ${e}`),
                  );
              }
            },
          };

          await runBuildPipeline(deps, {
            tenantId,
            siteId,
            mode: (mode as "draft" | "production") ?? "production",
          });

          this.logger.log(`Build completed: site=${siteId}`);
          this.channel?.ack(msg);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `Build failed: site=${siteId}, retry=${retryCount}, error=${errMsg}`,
          );

          // Determine retry routing
          const routingKey = getRetryRoutingKey(retryCount);

          if (routingKey) {
            // Route to retry queue via DLX exchange
            this.logger.log(
              `Routing to retry queue: ${routingKey} (attempt ${retryCount + 1})`,
            );
            this.channel?.publish(
              DLX_EXCHANGE,
              routingKey,
              msg.content,
              {
                persistent: true,
                priority: msg.properties.priority,
                headers: {
                  ...msg.properties.headers,
                  "x-death": [
                    ...(((msg.properties.headers?.["x-death"] as unknown[]) ?? []) as Array<Record<string, unknown>>),
                    {
                      queue: SITES_QUEUE,
                      reason: "rejected",
                      count: 1,
                      time: new Date(),
                    },
                  ],
                  "x-retry-count": retryCount + 1,
                },
              },
            );
            this.channel?.ack(msg); // ack original
          } else {
            // Max retries exceeded — route to dead letter
            this.logger.warn(
              `Max retries exceeded for site=${siteId}, routing to dead letter`,
            );
            this.channel?.publish(
              DLX_EXCHANGE,
              DEAD_LETTER_QUEUE,
              msg.content,
              {
                persistent: true,
                headers: {
                  ...msg.properties.headers,
                  "x-final-error": errMsg,
                  "x-retry-count": retryCount,
                },
              },
            );
            this.channel?.ack(msg); // ack original
          }
        }
      },
      { noAck: false },
    );
  }
}

/**
 * Build Queue Consumer with DLX retry support.
 *
 * Consumes `sites.build` messages from sites_queue with:
 * - Priority-aware consumption (x-max-priority: 10)
 * - prefetchCount: 3 (max 3 concurrent builds)
 * - DLX retry on failure: nack → retry_5s → retry_30s → retry_120s → dead_letter
 * - x-death header tracking for retry count
 * - Build progress updates to DB during pipeline execution
 * - Automatic reconnect via amqp-connection-manager: channel setup (prefetch,
 *   queue assertion, consume) re-runs on every (re)connect, so the consumer
 *   comes back after a broker restart and starts even if the broker is up later
 */
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as amqp from "amqp-connection-manager";
import type { ChannelWrapper } from "amqp-connection-manager";
import type { Channel, ConsumeMessage, Options } from "amqplib";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { ClientProxy } from "@nestjs/microservices";
import {
  DLX_EXCHANGE,
  DEAD_LETTER_QUEUE,
  SITES_BUILD_QUEUE,
  getRetryCountFromHeaders,
  getRetryRoutingKey,
} from "./retry-setup.service";
import {
  PG_CONNECTION,
  PRODUCT_RMQ_SERVICE,
  BILLING_RMQ_SERVICE,
} from "../constants";
import * as schema from "../db/schema";
import {
  runBuildPipeline,
  type BuildDependencies,
} from "../generator/build.service";
import { S3StorageService } from "../storage/s3.service";
import { StorefrontHandoff } from "../storefront-handoff/storefront-handoff.service";

const MAX_CONCURRENT_BUILDS = 3;
const BUILD_PATTERN = "sites.build_queued";

// A build holds its message unacked for seconds to minutes; if the connection
// drops meanwhile, the broker redelivers the message and the build runs again.
// So keep the 60 s heartbeat this consumer had with plain amqplib (the broker
// default) instead of the connection manager's 5 s: a stalled host must not
// drop it. A broker restart closes the socket and is noticed at once anyway.
const HEARTBEAT_SECONDS = 60;
const RECONNECT_SECONDS = 5;

interface BuildJob {
  tenantId: string;
  siteId: string;
  buildId?: string;
  mode?: string;
  retryCount: number;
}

interface BuildProgress {
  buildId?: string;
  stage?: string;
  percent?: number;
  message?: string;
}

/**
 * What to do with a message on the channel it arrived on. Applied once,
 * after processing, so a failure to settle never re-enters build error handling.
 */
type Settlement = (channel: Channel, msg: ConsumeMessage) => void;

const acknowledge: Settlement = (channel, msg) => channel.ack(msg);

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function retryPublishOptions(
  msg: ConsumeMessage,
  retryCount: number,
): Options.Publish {
  const previousDeaths = ((msg.properties.headers?.["x-death"] as unknown[]) ??
    []) as Array<Record<string, unknown>>;
  return {
    persistent: true,
    priority: msg.properties.priority,
    headers: {
      ...msg.properties.headers,
      "x-death": [
        ...previousDeaths,
        {
          queue: SITES_BUILD_QUEUE,
          reason: "rejected",
          count: 1,
          time: new Date(),
        },
      ],
      "x-retry-count": retryCount + 1,
    },
  };
}

function deadLetterPublishOptions(
  msg: ConsumeMessage,
  retryCount: number,
  errMsg: string,
): Options.Publish {
  return {
    persistent: true,
    headers: {
      ...msg.properties.headers,
      "x-final-error": errMsg,
      "x-retry-count": retryCount,
    },
  };
}

@Injectable()
export class BuildQueueConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BuildQueueConsumer.name);
  private connection: amqp.AmqpConnectionManager | null = null;
  private channelWrapper: ChannelWrapper | null = null;

  constructor(
    private readonly config: ConfigService,
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
    @Inject(PRODUCT_RMQ_SERVICE)
    private readonly productClient: ClientProxy,
    @Inject(BILLING_RMQ_SERVICE)
    private readonly billingClient: ClientProxy,
    private readonly s3: S3StorageService,
    // Optional — тесты, собирающие потребителя напрямую, не обязаны его передавать.
    @Optional() private readonly handoff?: StorefrontHandoff,
  ) {}

  async onModuleInit(): Promise<void> {
    const enabled =
      (
        this.config.get<string>("BUILD_QUEUE_CONSUMER_ENABLED") ?? "false"
      ).toLowerCase() === "true";

    if (!enabled) {
      this.logger.log(
        "Build queue consumer disabled (BUILD_QUEUE_CONSUMER_ENABLED != true)",
      );
      return;
    }

    const rabbitmqUrl = this.config.get<string>("RABBITMQ_URL");
    if (!rabbitmqUrl) {
      this.logger.warn("RABBITMQ_URL not set, skipping build queue consumer");
      return;
    }

    try {
      this.startConsuming(rabbitmqUrl);
    } catch (err) {
      this.logger.error(
        `Failed to start build queue consumer: ${errorMessage(err)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.channelWrapper?.close();
      await this.connection?.close();
    } catch (err) {
      this.logger.warn(
        `Error closing build queue consumer: ${errorMessage(err)}`,
      );
    }
  }

  /**
   * Connects in the background — does not wait for the broker. The connection
   * manager keeps reconnecting and re-runs `setupChannel` on every new channel.
   */
  private startConsuming(rabbitmqUrl: string): void {
    this.connection = amqp.connect([rabbitmqUrl], {
      heartbeatIntervalInSeconds: HEARTBEAT_SECONDS,
      reconnectTimeInSeconds: RECONNECT_SECONDS,
    });

    this.connection.on("connect", () => {
      this.logger.log("BuildQueueConsumer connected to RabbitMQ");
    });

    this.connection.on("disconnect", (params: { err?: Error }) => {
      this.logger.warn(
        `BuildQueueConsumer disconnected: ${params.err?.message ?? "unknown"}`,
      );
    });

    this.channelWrapper = this.connection.createChannel({
      setup: (channel: Channel) => this.setupChannel(channel),
    });

    this.channelWrapper.on("error", (err: Error) => {
      this.logger.error(
        `Build queue consumer channel error: ${errorMessage(err)}`,
      );
    });
  }

  private async setupChannel(channel: Channel): Promise<void> {
    // Limit concurrent builds
    await channel.prefetch(MAX_CONCURRENT_BUILDS);

    // Ensure queue exists (idempotent — do NOT pass x-max-priority to avoid
    // PRECONDITION_FAILED if queue already exists without priority support)
    await channel.assertQueue(SITES_BUILD_QUEUE, {
      durable: true,
    });

    // The raw channel is passed on: a delivery tag is only valid on the
    // channel the message arrived on. Build and settle errors are caught inside.
    await channel.consume(
      SITES_BUILD_QUEUE,
      (msg: ConsumeMessage | null) => void this.handleMessage(msg, channel),
      { noAck: false },
    );

    this.logger.log(
      `Build queue consumer started (prefetch: ${MAX_CONCURRENT_BUILDS})`,
    );
  }

  private async handleMessage(
    msg: ConsumeMessage | null,
    channel: Channel,
  ): Promise<void> {
    if (!msg) return;

    const job = this.readJob(msg);
    const settlement = job ? await this.runJob(job, msg) : acknowledge;
    this.settle(settlement, channel, msg);
  }

  /** Returns null for messages that must be discarded (acked without a build). */
  private readJob(msg: ConsumeMessage): BuildJob | null {
    const data = this.parseContent(msg);
    if (!data) return null;

    // Only handle build pattern messages
    const pattern = data.pattern as string | undefined;
    if (pattern !== BUILD_PATTERN) {
      this.logger.warn(
        `Unexpected pattern in build queue: ${pattern}, discarding`,
      );
      return null;
    }

    const payload = data.data as Partial<BuildJob> | undefined;
    if (!payload) {
      this.logger.warn("build_queued message without data, acking to discard");
      return null;
    }

    const { tenantId, siteId, buildId, mode } = payload;
    if (!tenantId || !siteId) {
      this.logger.warn("build_queued missing tenantId/siteId, discarding");
      return null;
    }

    const retryCount = getRetryCountFromHeaders(
      msg.properties as unknown as Record<string, unknown>,
    );
    return { tenantId, siteId, buildId, mode, retryCount };
  }

  private parseContent(msg: ConsumeMessage): Record<string, unknown> | null {
    try {
      return (
        (JSON.parse(msg.content.toString()) as Record<string, unknown>) ?? {}
      );
    } catch {
      this.logger.warn("Invalid JSON in message, acking to discard");
      return null;
    }
  }

  private async runJob(
    job: BuildJob,
    msg: ConsumeMessage,
  ): Promise<Settlement> {
    this.logger.log(
      `Processing build: site=${job.siteId}, retry=${job.retryCount}, priority=${msg.properties.priority ?? "default"}`,
    );
    // Задание, вставшее до блока 6: магазин новой темы собирает сборщик витрин.
    if (await this.handoff?.handOff(job.siteId, "sites_build_queue")) {
      return acknowledge;
    }

    try {
      await this.markBuildStarted(job);
      await runBuildPipeline(this.buildDependencies(), {
        tenantId: job.tenantId,
        siteId: job.siteId,
        mode: (job.mode as "draft" | "production") ?? "production",
      });
      this.logger.log(`Build completed: site=${job.siteId}`);
      return acknowledge;
    } catch (err) {
      return this.failureSettlement(job, err);
    }
  }

  private async markBuildStarted(job: BuildJob): Promise<void> {
    if (!job.buildId) return;

    // Update retry count in DB
    await this.db
      .update(schema.siteBuild)
      .set({ retryCount: job.retryCount, startedAt: new Date() })
      .where(eq(schema.siteBuild.id, job.buildId));
  }

  private buildDependencies(): BuildDependencies {
    return {
      db: this.db,
      schema,
      productClient: this.productClient,
      billingClient: this.billingClient,
      s3: this.s3,
      eventsEmit: (_eventPattern, eventPayload) =>
        this.saveBuildProgress(eventPayload as BuildProgress),
    };
  }

  private saveBuildProgress(progress: BuildProgress): void {
    if (!progress.buildId) return;

    this.db
      .update(schema.siteBuild)
      .set({
        stage: progress.stage,
        percent: progress.percent,
        message: progress.message,
      })
      .where(eq(schema.siteBuild.id, progress.buildId))
      .catch((e) => this.logger.warn(`Failed to update build progress: ${e}`));
  }

  private failureSettlement(job: BuildJob, err: unknown): Settlement {
    const errMsg = errorMessage(err);
    this.logger.error(
      `Build failed: site=${job.siteId}, retry=${job.retryCount}, error=${errMsg}`,
    );

    const routingKey = getRetryRoutingKey(job.retryCount);
    return routingKey
      ? this.retrySettlement(routingKey, job.retryCount)
      : this.deadLetterSettlement(job, errMsg);
  }

  /** Route to retry queue via DLX exchange, then ack the original. */
  private retrySettlement(routingKey: string, retryCount: number): Settlement {
    this.logger.log(
      `Routing to retry queue: ${routingKey} (attempt ${retryCount + 1})`,
    );
    return (channel, msg) => {
      channel.publish(
        DLX_EXCHANGE,
        routingKey,
        msg.content,
        retryPublishOptions(msg, retryCount),
      );
      channel.ack(msg);
    };
  }

  /** Max retries exceeded — route to dead letter, then ack the original. */
  private deadLetterSettlement(job: BuildJob, errMsg: string): Settlement {
    this.logger.warn(
      `Max retries exceeded for site=${job.siteId}, routing to dead letter`,
    );
    return (channel, msg) => {
      channel.publish(
        DLX_EXCHANGE,
        DEAD_LETTER_QUEUE,
        msg.content,
        deadLetterPublishOptions(msg, job.retryCount, errMsg),
      );
      channel.ack(msg);
    };
  }

  /**
   * Applies the settlement on the channel the message came from. If that
   * channel closed meanwhile (connection dropped during a long build), the
   * delivery tag is dead: settling on a new channel would fail with
   * PRECONDITION_FAILED, so we only log — the broker requeues the unacked
   * message and the build runs again.
   */
  private settle(
    settlement: Settlement,
    channel: Channel,
    msg: ConsumeMessage,
  ): void {
    try {
      settlement(channel, msg);
    } catch (err) {
      this.logger.warn(
        `Could not settle build message, channel is gone (broker will redeliver): ${errorMessage(err)}`,
      );
    }
  }
}

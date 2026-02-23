/**
 * Product Update Listener — triggers site rebuilds when products change.
 *
 * Connects to a fanout exchange `product.events` via amqp-connection-manager,
 * consumes product.updated / product.bulk_status_changed events,
 * debounces per siteId (30s), skips frozen sites, and queues
 * builds with priority 5 (medium — between free=1 and paid=10).
 *
 * Uses a dedicated queue `sites_product_events` bound to the
 * product events exchange so we don't compete with product-service's
 * own RPC consumer.
 */
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as amqp from "amqp-connection-manager";
import type { ChannelWrapper } from "amqp-connection-manager";
import type { Channel, ConsumeMessage } from "amqplib";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, sql } from "drizzle-orm";
import { PG_CONNECTION } from "../constants";
import * as schema from "../db/schema";
import { BuildQueuePublisher } from "../rabbitmq/build-queue.service";
import { FragmentPatcher } from "./fragment-patcher.service";

const PRODUCT_EVENTS_EXCHANGE = "product.events";
const SITES_PRODUCT_EVENTS_QUEUE = "sites_product_events";
const DEBOUNCE_MS = 5_000; // 5 seconds — fast feedback for merchants
const FRAGMENT_PATCH_DEBOUNCE_MS = 10_000; // 10 seconds (faster than full rebuild)
const REBUILD_PRIORITY = 5;

/** Accumulated changes during debounce window */
interface DebouncedEntry {
  timer: ReturnType<typeof setTimeout>;
  tenantId: string;
  changes: Array<{
    event: string;
    productIds: string[];
    timestamp: string;
  }>;
}

@Injectable()
export class ProductUpdateListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProductUpdateListener.name);
  private connection: amqp.AmqpConnectionManager | null = null;
  private channelWrapper: ChannelWrapper | null = null;

  /** Debounce map: siteId → pending rebuild */
  private readonly debounceMap = new Map<string, DebouncedEntry>();

  /** Debounce map: siteId → pending fragment patch */
  private readonly fragmentPatchMap = new Map<
    string,
    { timer: ReturnType<typeof setTimeout>; tenantId: string }
  >();

  constructor(
    private readonly config: ConfigService,
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly buildQueue: BuildQueuePublisher,
    private readonly fragmentPatcher: FragmentPatcher,
  ) {}

  async onModuleInit(): Promise<void> {
    const enabled =
      (
        this.config.get<string>("PRODUCT_UPDATE_LISTENER_ENABLED") ?? "false"
      ).toLowerCase() === "true";

    if (!enabled) {
      this.logger.log(
        "Product update listener disabled (PRODUCT_UPDATE_LISTENER_ENABLED != true)",
      );
      return;
    }

    const rabbitmqUrl = this.config.get<string>("RABBITMQ_URL");
    if (!rabbitmqUrl) {
      this.logger.warn(
        "RABBITMQ_URL not set, skipping product update listener",
      );
      return;
    }

    try {
      await this.start(rabbitmqUrl);
    } catch (err) {
      this.logger.error(
        `Failed to start product update listener: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    // Clear all debounce timers
    for (const [, entry] of this.debounceMap) {
      clearTimeout(entry.timer);
    }
    this.debounceMap.clear();

    // Clear all fragment patch timers
    for (const [, entry] of this.fragmentPatchMap) {
      clearTimeout(entry.timer);
    }
    this.fragmentPatchMap.clear();

    await this.channelWrapper?.close();
    await this.connection?.close();
  }

  private async start(rabbitmqUrl: string): Promise<void> {
    this.connection = amqp.connect([rabbitmqUrl]);

    this.connection.on("connect", () => {
      this.logger.log("ProductUpdateListener connected to RabbitMQ");
    });

    this.connection.on("disconnect", (params: { err?: Error }) => {
      this.logger.warn(
        `ProductUpdateListener disconnected: ${params.err?.message ?? "unknown"}`,
      );
    });

    // Consumer channel: listen for product events
    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: Channel) => {
        // Declare fanout exchange for product events
        await channel.assertExchange(PRODUCT_EVENTS_EXCHANGE, "fanout", {
          durable: true,
        });

        // Create dedicated queue for sites-service product event consumption
        const q = await channel.assertQueue(SITES_PRODUCT_EVENTS_QUEUE, {
          durable: true,
        });

        // Bind to fanout exchange
        await channel.bindQueue(q.queue, PRODUCT_EVENTS_EXCHANGE, "");

        // Start consuming
        await channel.consume(
          q.queue,
          (msg: ConsumeMessage | null) => {
            void this.handleMessage(msg, channel);
          },
          { noAck: false },
        );

        this.logger.log(
          `Consuming product events from ${SITES_PRODUCT_EVENTS_QUEUE}`,
        );
      },
    });

    this.logger.log("Product update listener started");
  }

  private async handleMessage(
    msg: ConsumeMessage | null,
    channel: Channel,
  ): Promise<void> {
    if (!msg) return;

    try {
      const content = JSON.parse(msg.content.toString());
      const event = content.event as string | undefined;
      const tenantId = content.tenantId as string | undefined;
      const productIds = (content.productIds as string[]) ?? [];

      // Only handle product change events
      if (!event || !tenantId) {
        channel.ack(msg);
        return;
      }

      this.logger.log(
        `Product event: ${event}, tenant=${tenantId}, products=${productIds.length}`,
      );

      // Find all published (non-frozen) sites for this tenant.
      // Note: tenantId may be either the organization ID (site.tenantId)
      // or the site ID itself (site.id) — the product service stores
      // shopId which may be either, depending on the frontend context.
      const sites = await this.db
        .select({ id: schema.site.id, status: schema.site.status, islandsEnabled: schema.site.islandsEnabled })
        .from(schema.site)
        .where(
          and(
            sql`(${schema.site.tenantId} = ${tenantId} OR ${schema.site.id} = ${tenantId})`,
            sql`${schema.site.deletedAt} IS NULL`,
          ),
        );

      for (const site of sites) {
        // Skip frozen sites
        if (site.status === "frozen") {
          this.logger.log(
            `Skipping frozen site ${site.id} for product update rebuild`,
          );
          continue;
        }

        // Skip draft/archived sites — only rebuild published sites
        if (site.status !== "published") {
          continue;
        }

        // Island-enabled sites use fragment patching instead of full rebuild
        if (site.islandsEnabled) {
          this.debounceFragmentPatch(site.id, tenantId);
          continue;
        }

        // Debounce: accumulate changes and delay rebuild
        this.debounceBuild(site.id, tenantId, {
          event,
          productIds,
          timestamp: new Date().toISOString(),
        });
      }

      channel.ack(msg);
    } catch (err) {
      this.logger.error(
        `Failed to process product event: ${err instanceof Error ? err.message : err}`,
      );
      // Ack to avoid reprocessing bad messages forever
      channel.ack(msg);
    }
  }

  /**
   * Debounce build for a site: accumulate changes over 30s window,
   * then queue a single rebuild.
   */
  private debounceBuild(
    siteId: string,
    tenantId: string,
    change: { event: string; productIds: string[]; timestamp: string },
  ): void {
    const existing = this.debounceMap.get(siteId);

    if (existing) {
      // Accumulate changes, reset timer
      existing.changes.push(change);
      clearTimeout(existing.timer);
      existing.timer = setTimeout(() => {
        void this.flushBuild(siteId);
      }, DEBOUNCE_MS);
      this.logger.debug(
        `Debounce reset for site ${siteId} (${existing.changes.length} accumulated changes)`,
      );
    } else {
      // New debounce entry
      const entry: DebouncedEntry = {
        timer: setTimeout(() => {
          void this.flushBuild(siteId);
        }, DEBOUNCE_MS),
        tenantId,
        changes: [change],
      };
      this.debounceMap.set(siteId, entry);
      this.logger.log(`Debounce started for site ${siteId} (30s window)`);
    }
  }

  /**
   * Flush: queue a build for the site after debounce window expires.
   */
  private async flushBuild(siteId: string): Promise<void> {
    const entry = this.debounceMap.get(siteId);
    if (!entry) return;

    this.debounceMap.delete(siteId);

    const totalProducts = new Set(entry.changes.flatMap((c) => c.productIds))
      .size;

    this.logger.log(
      `Debounce expired for site ${siteId}: queuing rebuild ` +
        `(${entry.changes.length} events, ${totalProducts} unique products)`,
    );

    await this.buildQueue.queueBuild({
      tenantId: entry.tenantId,
      siteId,
      mode: "production",
      priority: REBUILD_PRIORITY,
      trigger: "product_update",
    });
  }

  /**
   * Debounce fragment patching for an island-enabled site.
   * Uses a shorter 10s window since patching is much faster than a full rebuild.
   */
  private debounceFragmentPatch(siteId: string, tenantId: string): void {
    const existing = this.fragmentPatchMap.get(siteId);

    if (existing) {
      clearTimeout(existing.timer);
      existing.timer = setTimeout(() => {
        void this.flushFragmentPatch(siteId);
      }, FRAGMENT_PATCH_DEBOUNCE_MS);
      this.logger.debug(
        `Fragment patch debounce reset for site ${siteId}`,
      );
    } else {
      this.fragmentPatchMap.set(siteId, {
        timer: setTimeout(() => {
          void this.flushFragmentPatch(siteId);
        }, FRAGMENT_PATCH_DEBOUNCE_MS),
        tenantId,
      });
      this.logger.log(
        `Fragment patch debounce started for site ${siteId} (10s window)`,
      );
    }
  }

  /**
   * Flush: patch fragments for an island-enabled site after debounce window expires.
   */
  private async flushFragmentPatch(siteId: string): Promise<void> {
    const entry = this.fragmentPatchMap.get(siteId);
    if (!entry) return;

    this.fragmentPatchMap.delete(siteId);

    this.logger.log(
      `Fragment patch debounce expired for site ${siteId}: patching fragments`,
    );

    await this.fragmentPatcher.patchFragments(siteId, entry.tenantId);
  }
}

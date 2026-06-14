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
 *
 * COLLECTION SEO auto-rebuild (зеркало per-product SEO в build.service):
 *   build.service генерит per-collection /collections/<slug> страницы +
 *   sitemap-collections.xml при КАЖДОМ full rebuild. Эти rebuild'ы триггерит
 *   debounceBuild ниже. Что покрыто из коробки:
 *     • Добавление/удаление товара в коллекцию (collections.service
 *       addProducts/removeProduct в product-service) ЭМИТИТ `product.updated`
 *       → попадает сюда → full rebuild → per-collection страницы/sitemap
 *       перегенерятся со свежим membership. ✅ ЗАВЯЗАНО.
 *   Что НЕ покрыто (BLOCKED — нет источника события):
 *     • create / rename / изменение description|slug / delete коллекции
 *       (collections.service create/update/remove) НЕ эмитят НИКАКОГО события.
 *       Это ровно те поля, что питают SEO-мету (title/description/canonical).
 *       Поэтому при редактировании ТОЛЬКО метаданных коллекции (без правок
 *       товаров) live-сайт НЕ перестроится автоматически — нужен эмиттер в
 *       product-service (например `collection.updated` на отдельном exchange
 *       ИЛИ переиспользовать product.events с типом события коллекции). Это
 *       ВНЕ scope этой задачи: НИКАКОГО collection-exchange здесь НЕ заводим
 *       (нечего слушать). Когда эмиттер появится — добавить bind/consume и
 *       вызвать тот же debounceBuild для затронутых сайтов.
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
const DEBOUNCE_MS = 45_000; // 45s — debounce window for the SEO FULL rebuild (batches rapid edits)
const FRAGMENT_PATCH_DEBOUNCE_MS = 5_000; // 5 seconds — fast fragment patching
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
    { timer: ReturnType<typeof setTimeout>; tenantId: string; storageSlug: string; flushing: boolean }
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
        .select({ id: schema.site.id, status: schema.site.status, islandsEnabled: schema.site.islandsEnabled, storageSlug: schema.site.storageSlug })
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

        // Fast path: instant fragment patch (catalog/cards/PDP content).
        this.debounceFragmentPatch(site.id, tenantId, site.storageSlug ?? site.id);
        // SEO path: debounced FULL rebuild regenerates per-slug /product/<slug> pages +
        // canonical/title/og meta + sitemap-products.xml + robots.txt (the fragment
        // patcher touches NONE of these — they live in build.service). The 45s debounce
        // batches rapid edits into one build; new products also get their per-slug page
        // generated here (closing the /product/<new-slug> 404 gap once the build lands).
        // The same rebuild ALSO regenerates per-collection /collections/<slug> pages +
        // sitemap-collections.xml (build.service mirrors the per-product SEO for
        // collections). Collection MEMBERSHIP changes arrive here as `product.updated`
        // (collections.service addProducts/removeProduct emits it), so adding/removing a
        // product in a collection refreshes that collection's SEO page automatically.
        // NOTE: collection metadata-only edits (name/description/slug/create/delete) emit
        // NO event today — see the class doc comment; that path is blocked on a
        // product-service emitter and is out of scope here.
        this.debounceBuild(site.id, tenantId, {
          event,
          productIds,
          timestamp: (content.timestamp as string) ?? new Date().toISOString(),
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
   * Debounce build for a site: accumulate changes over debounce window,
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
      this.logger.log(`Debounce started for site ${siteId} (${DEBOUNCE_MS / 1_000}s window)`);
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
   * Leading-edge debounce: first event fires immediately, subsequent events
   * within the window are batched into one trailing call.
   */
  private debounceFragmentPatch(siteId: string, tenantId: string, storageSlug: string): void {
    const existing = this.fragmentPatchMap.get(siteId);

    if (existing) {
      // Already processing or waiting — reset trailing timer
      clearTimeout(existing.timer);
      existing.timer = setTimeout(() => {
        void this.flushFragmentPatch(siteId);
      }, FRAGMENT_PATCH_DEBOUNCE_MS);
      this.logger.debug(
        `Fragment patch debounce reset for site ${siteId}`,
      );
    } else {
      // First event — fire immediately (leading edge)
      const entry = {
        timer: null as unknown as ReturnType<typeof setTimeout>,
        tenantId,
        storageSlug,
        flushing: true,
      };
      this.fragmentPatchMap.set(siteId, entry);
      this.logger.log(
        `Fragment patch: immediate trigger for site ${siteId}`,
      );
      void this.flushFragmentPatch(siteId);
    }
  }

  /**
   * Flush: patch fragments, then set a cooldown window for subsequent events.
   */
  private async flushFragmentPatch(siteId: string): Promise<void> {
    const entry = this.fragmentPatchMap.get(siteId);
    if (!entry) return;

    this.logger.log(
      `Fragment patch executing for site ${siteId}`,
    );

    try {
      await this.fragmentPatcher.patchFragments(siteId, entry.tenantId, entry.storageSlug);
    } finally {
      // After flush, set a cooldown — if more events arrived during flush,
      // the timer is already set. If not, clean up.
      const current = this.fragmentPatchMap.get(siteId);
      if (current && !current.timer) {
        // No pending events during flush — set cooldown then clean up
        current.timer = setTimeout(() => {
          this.fragmentPatchMap.delete(siteId);
        }, FRAGMENT_PATCH_DEBOUNCE_MS);
      }
    }
  }
}

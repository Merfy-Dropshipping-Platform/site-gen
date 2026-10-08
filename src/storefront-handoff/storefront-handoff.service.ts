/**
 * StorefrontHandoff — магазины новой темы старый конвейер не собирает
 * (design.md блока 6 «Каркаса витрины», раздел 4, «Старые пути»).
 *
 * - `handOff(siteId, trigger)` — проверка «магазин новой темы?» на входах старой
 *   сборки: `SiteGeneratorService.build`, постановка в `sites_build_queue`
 *   (`BuildQueuePublisher.queueBuild`) и задание из неё
 *   (`BuildQueueConsumer.runJob` → `runBuildPipeline`). Магазин новой темы —
 *   вместо старой сборки событие сборщику и `true`; нынешний — `false`, старый
 *   путь идёт как раньше.
 * - `notify(siteId, type, source)` — событие сборщику из источника внутри
 *   site-gen (имя, домен, политики, контакты, брендинг), только для магазина
 *   новой темы.
 * - `requestBuild(siteId, source)` — публикация магазина новой темы: событие
 *   merchant-publish с адресом ответа, сборщик отвечает номером сборки, в
 *   которую вошла публикация (прямой ответ RabbitMQ, direct reply-to). Не
 *   ответил за STOREFRONT_BUILD_REPLY_MS (по умолчанию 3 с) — null: событие
 *   уже в очереди сборщика, публикация отвечает «queued».
 *
 * Новые темы — ключи packages/storefront-build/theme-versions.json (блок 4).
 * Событие — в точку обмена `content.events` (topic), ключ маршрута — тип
 * события: `{ v: 1, type, siteId, eventAt, source }`. Как ActivityLogPublisher:
 * сбой брокера или базы не роняет вызывающего — пишется в лог; при сбое
 * проверки магазин идёт старым путём, как до блока 6.
 */
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as amqp from "amqp-connection-manager";
import type { ChannelWrapper } from "amqp-connection-manager";
import type { Channel, ConsumeMessage } from "amqplib";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import * as path from "path";
import { PG_CONNECTION } from "../constants";
import * as schema from "../db/schema";

export const CONTENT_EXCHANGE = "content.events";
// Прямой ответ RabbitMQ: своей очереди нет, ответ приходит на канал, который
// опубликовал событие (https://www.rabbitmq.com/docs/direct-reply-to).
export const REPLY_QUEUE = "amq.rabbitmq.reply-to";
const REPLY_TIMEOUT_MS = 3_000;
export const THEME_VERSIONS_FILE =
  "packages/storefront-build/theme-versions.json";

// trigger старой постановки в очередь → событие сборщика (rebuild-events.json
// блока 3). Остальные входы старой сборки — служебное событие old-path.
export const TRIGGER_EVENTS: Readonly<Record<string, string>> = {
  publish: "merchant-publish",
  product_update: "product-change",
  publication_change: "publication-change",
};
export const OLD_PATH_EVENT = "old-path";

export function readNewThemeIds(root: string): ReadonlySet<string> {
  const file = path.join(root, THEME_VERSIONS_FILE);
  return new Set(Object.keys(JSON.parse(readFileSync(file, "utf8"))));
}

const message = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

// Ответ сборщика: { v: 1, build } — номер сборки или null (магазин не его).
export function parseBuildReply(content: Buffer): number | null {
  try {
    const build: unknown = JSON.parse(content.toString("utf8"))?.build;
    return typeof build === "number" && Number.isSafeInteger(build)
      ? build
      : null;
  } catch {
    return null;
  }
}

@Injectable()
export class StorefrontHandoff implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StorefrontHandoff.name);
  private readonly newThemes = readNewThemeIds(process.cwd());
  private connection: amqp.AmqpConnectionManager | null = null;
  private channel: ChannelWrapper | null = null;
  // Ждущие ответа сборщика публикации: correlationId → кому отдать номер.
  private readonly replies = new Map<string, (build: number | null) => void>();
  private readonly replyTimeoutMs: number;

  constructor(
    private readonly config: ConfigService,
    @Inject(PG_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {
    const configured = Number(config.get<string>("STOREFRONT_BUILD_REPLY_MS"));
    this.replyTimeoutMs = configured > 0 ? configured : REPLY_TIMEOUT_MS;
  }

  onModuleInit(): void {
    const rabbitmqUrl = this.config.get<string>("RABBITMQ_URL");
    if (!rabbitmqUrl) {
      this.logger.warn(
        "RABBITMQ_URL not set — events to storefront builder disabled",
      );
      return;
    }
    this.connection = amqp.connect([rabbitmqUrl]);
    this.channel = this.connection.createChannel({
      json: false,
      setup: async (ch: Channel) => {
        await ch.assertExchange(CONTENT_EXCHANGE, "topic", { durable: true });
        // Прямой ответ — только без подтверждений и на том же канале.
        await ch.consume(REPLY_QUEUE, (msg) => this.onReply(msg), {
          noAck: true,
        });
      },
    });
  }

  private onReply(msg: ConsumeMessage | null): void {
    const answer = this.replies.get(msg?.properties.correlationId);
    if (msg && answer) answer(parseBuildReply(msg.content));
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }

  /** Магазин новой темы? Сбой базы — «нет»: старый путь, как до блока 6. */
  async isNewTheme(siteId: string): Promise<boolean> {
    try {
      const [row] = await this.db
        .select({ themeId: schema.site.themeId })
        .from(schema.site)
        .where(eq(schema.site.id, siteId));
      return this.newThemes.has(row?.themeId ?? "");
    } catch (e) {
      this.logger.warn(`isNewTheme failed for ${siteId}: ${message(e)}`);
      return false;
    }
  }

  /** Вход старой сборки: магазин новой темы — событие сборщику и true. */
  async handOff(siteId: string, trigger: string): Promise<boolean> {
    if (!(await this.isNewTheme(siteId))) return false;
    const type = TRIGGER_EVENTS[trigger] ?? OLD_PATH_EVENT;
    this.logger.log(
      `отдано сборщику: site=${siteId} trigger=${trigger} event=${type}`,
    );
    await this.publish(siteId, type, `old-path:${trigger}`);
    return true;
  }

  /** Источник внутри site-gen: событие сборщику, если магазин новой темы. */
  async notify(siteId: string, type: string, source: string): Promise<void> {
    if (!(await this.isNewTheme(siteId))) return;
    await this.publish(siteId, type, source);
  }

  /**
   * Публикация магазина новой темы: событие merchant-publish и номер сборки,
   * в которую оно вошло. null — сборщик не ответил за тайм-аут или брокер
   * недоступен; событие, если ушло, сборщик возьмёт позже.
   */
  async requestBuild(siteId: string, source: string): Promise<number | null> {
    const correlationId = randomUUID();
    const reply = this.waitReply(correlationId);
    const sent = await this.publish(siteId, "merchant-publish", source, {
      replyTo: REPLY_QUEUE,
      correlationId,
    });
    if (!sent) this.replies.get(correlationId)?.(null);
    const build = await reply;
    if (build === null)
      this.logger.warn(
        `сборщик не ответил за ${this.replyTimeoutMs} мс: site=${siteId}, публикация — queued`,
      );
    return build;
  }

  private waitReply(correlationId: string): Promise<number | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(
        () => this.replies.get(correlationId)?.(null),
        this.replyTimeoutMs,
      );
      this.replies.set(correlationId, (build) => {
        clearTimeout(timer);
        this.replies.delete(correlationId);
        resolve(build);
      });
    });
  }

  private async publish(
    siteId: string,
    type: string,
    source: string,
    reply: { replyTo?: string; correlationId?: string } = {},
  ): Promise<boolean> {
    if (!this.channel) {
      this.logger.warn(`broker not ready, dropping ${type} for ${siteId}`);
      return false;
    }
    const body = {
      v: 1,
      type,
      siteId,
      eventAt: new Date().toISOString(),
      source,
    };
    try {
      await this.channel.publish(
        CONTENT_EXCHANGE,
        type,
        Buffer.from(JSON.stringify(body)),
        {
          persistent: true,
          contentType: "application/json",
          ...reply,
        },
      );
      return true;
    } catch (e) {
      this.logger.warn(`publish ${type} for ${siteId} failed: ${message(e)}`);
      return false;
    }
  }
}

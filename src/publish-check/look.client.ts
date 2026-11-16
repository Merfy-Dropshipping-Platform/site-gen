/**
 * RPC к проверяющему процессу (`storefront-checker`, задание `storefront.look`) для проверки публикации (16.11).
 * Устройство — как у клиента шлюза (`api-gateway/src/sites/look/storefront-look.client.ts`), договор задания и ответа —
 * README `packages/storefront-builder`, раздел «Снимок черновика»:
 *   - перед отправкой `checkQueue`: очередь никто не слушает — отказ сразу, а не через полминуты;
 *   - у задания `expiration`: не взятое за срок брокер удаляет, поднявшийся процесс не рисует ненужное;
 *   - формат — как у ClientProxy Nest (`{ pattern, data, id }` → `{ err, response }`), ответ — на прямой адрес
 *     RabbitMQ с тем же correlationId.
 */
import { randomUUID } from "node:crypto";
import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as amqp from "amqp-connection-manager";
import type {
  AmqpConnectionManager,
  ChannelWrapper,
} from "amqp-connection-manager";
import type { ConsumeMessage } from "amqplib";

/** Имена — те же, что в `packages/storefront-builder/src/look/look-queue.ts`. */
export const LOOKS_QUEUE = "storefront_looks";
export const LOOK_PATTERN = "storefront.look";
const REPLY_TO = "amq.rabbitmq.reply-to";
/** Ждать брокер не дольше: лежит брокер — отказ, а не вечное ожидание. */
const CONNECT_TIMEOUT_MS = 5_000;

export interface LookJob {
  siteId: string;
  page: string;
  devices: "mobile" | "desktop" | "both";
  full: boolean;
  clips?: boolean;
  sections?: string[];
}

export type LookOutcome =
  | { kind: "snapshot"; snapshot: unknown }
  | { kind: "refused"; code: string; message: string }
  | { kind: "unavailable"; reason: string }
  | { kind: "timeout" };

/** Клиент снимков: в тестах подменяется. */
export interface LookRunner {
  look(job: LookJob, waitMs: number): Promise<LookOutcome>;
}

@Injectable()
export class StorefrontLookClient implements LookRunner, OnModuleDestroy {
  private readonly logger = new Logger(StorefrontLookClient.name);
  private readonly url: string | undefined;
  private connection: AmqpConnectionManager | undefined;
  private rpc: ChannelWrapper | undefined;
  private probe: ChannelWrapper | undefined;
  private replies: Promise<unknown> | undefined;
  private readonly waiters = new Map<string, (outcome: LookOutcome) => void>();

  constructor(config: ConfigService) {
    this.url = config.get<string>("RABBITMQ_URL");
  }

  /** Соединение — при первом снимке: без публикаций брокер лишний раз не держим. */
  private open(url: string): { rpc: ChannelWrapper; probe: ChannelWrapper } {
    if (!this.connection || !this.rpc || !this.probe) {
      this.connection = amqp.connect([url]);
      this.rpc = this.connection.createChannel();
      this.probe = this.connection.createChannel();
      // checkQueue на несуществующей очереди закрывает канал — обёртка поднимет его сама.
      this.probe.on("error", (error: unknown) =>
        this.logger.warn(`look probe channel: ${String(error)}`),
      );
      this.replies = this.rpc.consume(
        REPLY_TO,
        (message) => this.settle(message),
        { noAck: true },
      );
    }
    return { rpc: this.rpc, probe: this.probe };
  }

  private settle(message: ConsumeMessage): void {
    const id = String(message.properties.correlationId);
    this.waiters.get(id)?.(outcomeOf(message));
  }

  private async listeners(probe: ChannelWrapper): Promise<number> {
    try {
      const ready = probe
        .waitForConnect()
        .then(() => probe.checkQueue(LOOKS_QUEUE))
        .then((queue) => queue.consumerCount);
      return await withTimeout(ready, CONNECT_TIMEOUT_MS, 0);
    } catch {
      return 0;
    }
  }

  async look(job: LookJob, waitMs: number): Promise<LookOutcome> {
    if (!this.url)
      return { kind: "unavailable", reason: "RABBITMQ_URL не задан" };
    const { rpc, probe } = this.open(this.url);
    if ((await this.listeners(probe)) === 0)
      return {
        kind: "unavailable",
        reason: "служба снимков не слушает очередь",
      };
    const subscribed = await withTimeout(
      Promise.resolve(this.replies).then(() => true),
      CONNECT_TIMEOUT_MS,
      false,
    ).catch(() => false);
    if (!subscribed)
      return { kind: "unavailable", reason: "нет канала ответа" };
    return this.send(rpc, job, waitMs);
  }

  private async send(
    rpc: ChannelWrapper,
    job: LookJob,
    waitMs: number,
  ): Promise<LookOutcome> {
    const id = randomUUID();
    const data = { v: 1, ...job, deadline: Date.now() + waitMs };
    const outcome = new Promise<LookOutcome>((resolve) =>
      this.waiters.set(id, resolve),
    );
    const timer = setTimeout(
      () => this.waiters.get(id)?.({ kind: "timeout" }),
      waitMs,
    );
    rpc
      .sendToQueue(
        LOOKS_QUEUE,
        Buffer.from(JSON.stringify({ pattern: LOOK_PATTERN, data, id })),
        {
          replyTo: REPLY_TO,
          correlationId: id,
          contentType: "application/json",
          expiration: String(waitMs),
        },
      )
      .catch((error: unknown) => {
        this.logger.warn(`look publish failed: ${String(error)}`);
        this.waiters.get(id)?.({
          kind: "unavailable",
          reason: "задание не ушло в очередь",
        });
      });
    try {
      return await outcome;
    } finally {
      clearTimeout(timer);
      this.waiters.delete(id);
    }
  }

  async onModuleDestroy(): Promise<void> {
    const connection = this.connection;
    this.connection = undefined;
    await Promise.allSettled([this.rpc?.close(), this.probe?.close()]);
    await connection?.close();
  }
}

function withTimeout<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/** Ответ процесса `{ err, response }`: `response` — `{ ok, snapshot }` или `{ ok: false, error }`. */
export function outcomeOf(
  message: Pick<ConsumeMessage, "content">,
): LookOutcome {
  const broken: LookOutcome = {
    kind: "refused",
    code: "invalid",
    message: "ответ службы снимков не по форме",
  };
  let body: unknown;
  try {
    body = JSON.parse(message.content.toString("utf8"));
  } catch {
    return broken;
  }
  if (typeof body !== "object" || body === null) return broken;
  const { err, response } = body as { err?: unknown; response?: unknown };
  if (
    (err !== undefined && err !== null) ||
    typeof response !== "object" ||
    response === null
  )
    return broken;
  const reply = response as {
    ok?: unknown;
    snapshot?: unknown;
    error?: { code?: unknown; message?: unknown };
  };
  if (reply.ok === true) return { kind: "snapshot", snapshot: reply.snapshot };
  if (reply.ok === false && reply.error) {
    return {
      kind: "refused",
      code: typeof reply.error.code === "string" ? reply.error.code : "invalid",
      message:
        typeof reply.error.message === "string"
          ? reply.error.message
          : "отказ без причины",
    };
  }
  return broken;
}

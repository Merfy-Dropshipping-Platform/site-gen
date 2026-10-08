import * as amqp from 'amqp-connection-manager';
import type { AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { StorefrontBuilderError, errorText } from './errors';
import {
  CONTENT_EXCHANGE,
  MAX_PRIORITY,
  PRODUCT_EXCHANGE,
  contentEventBody,
  jobBody,
  type BuildJob,
  type ContentEvent,
} from './events';
import type { Log } from './log';

// RabbitMQ сборщика (design.md блока 6, В6-2 В, Св-3 А). Имена — новые: нынешние sites_queue, sites_build_queue и
// sites_product_events сборщик не объявляет и не читает. Классические очереди: у RabbitMQ 3.13 приоритеты есть только
// у них (факты 21, 24).
//   storefront_builder_events — события: привязана к content.events (topic, «#») и к готовой product.events (fanout);
//   storefront_builds         — задания сборки, приоритет 1–3 (x-max-priority).
// Объявление — на каждом канале при каждом подключении (факт 6): брокер перезапустился — очереди на месте.

export const EVENTS_QUEUE = 'storefront_builder_events';
export const JOBS_QUEUE = 'storefront_builds';
// Журнал платформы (activity-log.publisher.ts site-gen): topic, ключ «<категория>.<действие>».
export const ACTIVITY_EXCHANGE = 'activity.events';
// Ждать подтверждения брокера не дольше, чем extensions (факт 7): лежит брокер — ошибка, а не вечное ожидание.
const PUBLISH_TIMEOUT_MS = 4_000;
// Обработчик упал не из-за сообщения (база или хранилище недоступны) — вернуть сообщение в очередь через секунду.
const REQUEUE_DELAY_MS = 1_000;
const RECONNECT_SECONDS = 2;

export interface Delivery {
  exchange: string;
  body: unknown;
}

export type Handler = (delivery: Delivery) => Promise<void>;

export interface Broker {
  publishJob: (job: BuildJob, priority: number) => Promise<void>;
  publishEvent: (event: ContentEvent) => Promise<void>;
  publishActivity: (routingKey: string, envelope: Record<string, unknown>) => Promise<void>;
  consume: (queue: string, prefetch: number, handler: Handler) => Promise<void>;
  close: () => Promise<void>;
}

export async function declareTopology(channel: ConfirmChannel): Promise<void> {
  await channel.assertExchange(CONTENT_EXCHANGE, 'topic', { durable: true });
  await channel.assertExchange(PRODUCT_EXCHANGE, 'fanout', { durable: true });
  await channel.assertExchange(ACTIVITY_EXCHANGE, 'topic', { durable: true });
  await channel.assertQueue(EVENTS_QUEUE, { durable: true });
  await channel.bindQueue(EVENTS_QUEUE, CONTENT_EXCHANGE, '#');
  await channel.bindQueue(EVENTS_QUEUE, PRODUCT_EXCHANGE, '');
  await channel.assertQueue(JOBS_QUEUE, { durable: true, arguments: { 'x-max-priority': MAX_PRIORITY } });
}

const json = (value: unknown): Buffer => Buffer.from(JSON.stringify(value));
const persistent = (priority?: number) => ({ persistent: true, contentType: 'application/json', priority });

function bodyOf(message: ConsumeMessage): unknown {
  try {
    return JSON.parse(message.content.toString('utf8'));
  } catch (error) {
    throw new StorefrontBuilderError('message-invalid', 'не JSON', { path: message.fields.routingKey, cause: error });
  }
}

const isDropped = (error: unknown): boolean =>
  error instanceof StorefrontBuilderError && error.code === 'message-invalid';

// Сообщение обработано — подтверждаем. Сообщение негодное — в журнал и подтверждаем: повтор его не починит. Упало
// что-то другое — в журнал и через секунду обратно в очередь.
async function deliver(channel: ChannelWrapper, message: ConsumeMessage, handler: Handler, log: Log) {
  try {
    await handler({ exchange: message.fields.exchange, body: bodyOf(message) });
    channel.ack(message);
  } catch (error) {
    log('message-failed', { queue: message.fields.routingKey, error: errorText(error), dropped: isDropped(error) });
    if (isDropped(error)) return channel.ack(message);
    setTimeout(() => channel.nack(message, false, true), REQUEUE_DELAY_MS);
  }
}

function openChannel(connection: AmqpConnectionManager): ChannelWrapper {
  return connection.createChannel({ setup: declareTopology, publishTimeout: PUBLISH_TIMEOUT_MS });
}

export function openBroker(url: string, log: Log): Broker {
  const connection = amqp.connect([url], { reconnectTimeInSeconds: RECONNECT_SECONDS });
  connection.on('disconnect', ({ err }: { err?: Error }) => log('broker-disconnected', { error: errorText(err) }));
  const publisher = openChannel(connection);
  const consumers: ChannelWrapper[] = [];
  const consume = async (queue: string, prefetch: number, handler: Handler): Promise<void> => {
    const channel = openChannel(connection);
    consumers.push(channel);
    await channel.consume(queue, (message) => void deliver(channel, message, handler, log), { prefetch });
  };
  return {
    publishJob: async (job, priority) => {
      await publisher.sendToQueue(JOBS_QUEUE, json(jobBody(job)), persistent(priority));
    },
    publishEvent: async (event) => {
      await publisher.publish(CONTENT_EXCHANGE, event.type, json(contentEventBody(event)), persistent());
    },
    publishActivity: async (routingKey, envelope) => {
      await publisher.publish(ACTIVITY_EXCHANGE, routingKey, json(envelope), persistent());
    },
    consume,
    close: async () => {
      await Promise.all([publisher, ...consumers].map((channel) => channel.close()));
      await connection.close();
    },
  };
}

import { randomUUID } from 'node:crypto';
import * as amqp from 'amqp-connection-manager';
import type { AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';
import type { Channel, ConsumeMessage } from 'amqplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openBroker, type Broker } from '../../src/broker';
import { startDesigns } from '../../src/design/design-job';
import { DESIGN_PATTERN, DESIGNS_QUEUE } from '../../src/design/design-queue';
import { finishStyle } from '../../src/design/design-style';
import { DesignError, type DesignSnapshot } from '../../src/design/design-types';
import { STACK, until } from './stack';

// RPC storefront.design через настоящий RabbitMQ стенда: шлюз (api-gateway#127) проверяет очередь checkQueue,
// шлёт { pattern, data, id } с replyTo amq.rabbitmq.reply-to, correlationId и expiration и ждёт { err, response,
// isDisposed, id }. Снятие — двойник: браузер здесь проверяют design-browser.test.ts и живой прогон стенда.

const snapshot: DesignSnapshot = {
  v: 1,
  ok: true,
  tool: 'own',
  toolVersion: 'js-test',
  outlineTool: 'dom',
  ms: 10,
  style: finishStyle({}, { url: 'https://shop.example/', finalUrl: 'https://shop.example/', title: 'Т' }),
  outline: { v: 1, blocks: [] },
  content: null,
  raw: {},
};

describe('RPC storefront.design через RabbitMQ', () => {
  let broker: Broker;
  let connection: AmqpConnectionManager;
  let channel: ChannelWrapper;
  const replies = new Map<string, (body: unknown) => void>();

  beforeAll(async () => {
    broker = openBroker(STACK.rabbitmqUrl, () => undefined);
    await startDesigns(broker, {
      run: (input) =>
        input.url.includes('blocked') ? Promise.reject(new DesignError('blocked', 'нельзя')) : Promise.resolve(snapshot),
      timeoutMs: 60_000,
      slots: 1,
      now: () => Date.now(),
      log: () => undefined,
    });
    connection = amqp.connect([STACK.rabbitmqUrl]);
    channel = connection.createChannel({
      setup: async (ch: Channel) => {
        await ch.consume('amq.rabbitmq.reply-to', (msg: ConsumeMessage | null) => answer(msg), { noAck: true });
      },
    });
    await channel.waitForConnect();
  });

  afterAll(async () => {
    await channel.close();
    await connection.close();
    await broker.close();
  });

  function answer(msg: ConsumeMessage | null): void {
    const properties: { correlationId?: unknown } = msg?.properties ?? {};
    const reply = replies.get(String(properties.correlationId));
    if (msg !== null && reply !== undefined) reply(JSON.parse(msg.content.toString('utf8')));
  }

  async function design(url: string): Promise<unknown> {
    const id = randomUUID();
    const reply = new Promise((resolve) => replies.set(id, resolve));
    const data = { v: 1, siteId: 'site-1', url, owned: false, deadline: Date.now() + 90_000 };
    await channel.sendToQueue(DESIGNS_QUEUE, Buffer.from(JSON.stringify({ pattern: DESIGN_PATTERN, data, id })), {
      replyTo: 'amq.rabbitmq.reply-to',
      correlationId: id,
      contentType: 'application/json',
      expiration: '90000',
    });
    return reply;
  }

  it('очередь объявлена и слушается — шлюз видит потребителя', async () => {
    // Канал потребителя объявляет очередь при подключении — ждём его, как шлюз ждёт запуска процесса.
    const listeners = (): Promise<number> =>
      channel.checkQueue(DESIGNS_QUEUE).then(
        (queue) => queue.consumerCount,
        () => 0,
      );
    await until(async () => (await listeners()) >= 1);
    expect(await listeners()).toBeGreaterThanOrEqual(1);
  });

  it('снимок и отказ — ответом в формате ClientProxy Nest на прямой адрес', async () => {
    const ok = await design('https://shop.example/');
    expect(ok).toMatchObject({ err: null, isDisposed: true, response: { v: 1, ok: true, tool: 'own', outlineTool: 'dom' } });
    const refused = await design('https://blocked.example/');
    expect(refused).toMatchObject({ err: null, response: { v: 1, ok: false, error: { code: 'blocked', message: 'нельзя' } } });
  });
});

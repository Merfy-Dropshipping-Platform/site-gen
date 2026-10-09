import amqplib from 'amqplib';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EVENTS_QUEUE, JOBS_QUEUE, openBroker, type Broker, type Delivery } from '../../src/broker';
import { CONTENT_EXCHANGE, PRODUCT_EXCHANGE } from '../../src/events';
import { STACK, until, wait } from './stack';

// Очереди сборщика на настоящем RabbitMQ 3.13: приоритет, места (prefetch), обе точки обмена, негодное сообщение.
let raw: amqplib.ChannelModel;
let channel: amqplib.Channel;
let broker: Broker;
const lines: string[] = [];

beforeAll(async () => {
  raw = await amqplib.connect(STACK.rabbitmqUrl);
  channel = await raw.createChannel();
});
afterAll(() => raw.close());

beforeEach(async () => {
  lines.length = 0;
  broker = openBroker(STACK.rabbitmqUrl, (message, fields) => lines.push(JSON.stringify({ message, ...fields })));
  await broker.publishEvent({ type: 'warm-up', siteId: 'x', eventAt: '2026-10-08T10:00:00.000Z', source: 'test' });
  await channel.purgeQueue(EVENTS_QUEUE);
  await channel.purgeQueue(JOBS_QUEUE);
});
afterEach(() => broker.close());

const AT = '2026-10-08T10:00:00.000Z';

describe('задания сборки', () => {
  it('из ждущих первым берётся задание с высшим приоритетом: публикация › правка › выпуск', async () => {
    await broker.publishJob({ siteId: 'release', build: 1 }, 1);
    await broker.publishJob({ siteId: 'edit', build: 2 }, 2);
    await broker.publishJob({ siteId: 'publish', build: 3 }, 3);
    const order: unknown[] = [];
    await broker.consume(JOBS_QUEUE, 1, (delivery) => Promise.resolve(void order.push(delivery.body)));
    await until(() => Promise.resolve(order.length === 3));
    expect(order).toEqual([
      { v: 1, siteId: 'publish', build: 3 },
      { v: 1, siteId: 'edit', build: 2 },
      { v: 1, siteId: 'release', build: 1 },
    ]);
  });

  it('одно место — второе задание не выдаётся, пока первое не подтверждено', async () => {
    let running = 0;
    let most = 0;
    let done = 0;
    const handler = async (): Promise<void> => {
      running += 1;
      most = Math.max(most, running);
      await wait(100);
      running -= 1;
      done += 1;
    };
    await broker.consume(JOBS_QUEUE, 1, handler);
    await Promise.all([1, 2, 3].map((build) => broker.publishJob({ siteId: 's', build }, 2)));
    await until(() => Promise.resolve(done === 3));
    expect(most).toBe(1);
  });
});

describe('события', () => {
  it('приходят из content.events и из готовой product.events — с именем точки обмена', async () => {
    const got: Delivery[] = [];
    await broker.consume(EVENTS_QUEUE, 1, (delivery) => Promise.resolve(void got.push(delivery)));
    await broker.publishEvent({ type: 'shop-name-change', siteId: 'site-1', eventAt: AT, source: 'test' });
    const product = { event: 'product.updated', tenantId: 't-1', productIds: ['p-1'], timestamp: AT };
    channel.publish(PRODUCT_EXCHANGE, '', Buffer.from(JSON.stringify(product)));
    await until(() => Promise.resolve(got.length === 2));
    expect(got).toContainEqual({
      exchange: CONTENT_EXCHANGE,
      body: { v: 1, type: 'shop-name-change', siteId: 'site-1', eventAt: AT, source: 'test' },
    });
    expect(got).toContainEqual({ exchange: PRODUCT_EXCHANGE, body: product });
  });

  it('не JSON — в журнал и подтверждено; обработчик упал — сообщение вернётся', async () => {
    let calls = 0;
    const handler = (): Promise<void> => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error('база недоступна')) : Promise.resolve();
    };
    await broker.consume(EVENTS_QUEUE, 1, handler);
    channel.publish(CONTENT_EXCHANGE, 'x', Buffer.from('{сломан'));
    channel.publish(CONTENT_EXCHANGE, 'x', Buffer.from('{}'));
    await until(() => Promise.resolve(calls === 2));
    expect(lines.filter((line) => line.includes('"dropped":true'))).toHaveLength(1);
    expect(lines.filter((line) => line.includes('база недоступна'))).toHaveLength(1);
  });

  it('нынешние очереди sites сборщик не объявляет', async () => {
    const probe = await raw.createChannel();
    probe.on('error', () => undefined);
    await expect(probe.checkQueue('sites_build_queue')).rejects.toThrow(/NOT_FOUND/);
  });
});

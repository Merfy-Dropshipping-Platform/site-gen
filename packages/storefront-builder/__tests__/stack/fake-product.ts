import amqplib from 'amqplib';
import { z } from 'zod';
import { PRODUCT_QUEUE } from '../../src/snapshot';
import { STACK } from './stack';

// Подставной сервис product: отвечает на product.list так, как отвечает Nest (server-rmq.js): { err, response,
// isDisposed, id } на replyTo с тем же correlationId. Что отвечать магазину — задаёт тест: товары, неуспех, ошибка или
// тишина (тайм-аут).
export type ProductAnswer = 'ok' | 'fail' | 'error' | 'silent';

export interface FakeProducts {
  answers: Map<string, ProductAnswer>;
  products: Map<string, Record<string, unknown>[]>;
  calls: () => number;
  close: () => Promise<void>;
}

const requestSchema = z.object({ pattern: z.string(), data: z.object({ siteId: z.string() }), id: z.string() });

type Reply = { err: unknown; response: unknown };

function replyFor(fake: Pick<FakeProducts, 'answers' | 'products'>, siteId: string): Reply | null {
  const replies: Record<ProductAnswer, Reply | null> = {
    ok: { err: null, response: { success: true, data: fake.products.get(siteId) ?? [] } },
    fail: { err: null, response: { success: false, message: 'база товаров недоступна' } },
    error: { err: { message: 'Internal server error' }, response: undefined },
    silent: null,
  };
  return replies[fake.answers.get(siteId) ?? 'ok'];
}

export async function startFakeProducts(): Promise<FakeProducts> {
  const connection = await amqplib.connect(STACK.rabbitmqUrl);
  const channel = await connection.createChannel();
  await channel.assertQueue(PRODUCT_QUEUE, { durable: true });
  await channel.purgeQueue(PRODUCT_QUEUE);
  const fake = { answers: new Map<string, ProductAnswer>(), products: new Map<string, Record<string, unknown>[]>() };
  let calls = 0;
  await channel.consume(PRODUCT_QUEUE, (message) => {
    if (message === null) return;
    channel.ack(message);
    calls += 1;
    const request = requestSchema.parse(JSON.parse(message.content.toString('utf8')));
    const reply = replyFor(fake, request.data.siteId);
    if (reply === null) return;
    const body = Buffer.from(JSON.stringify({ ...reply, isDisposed: true, id: request.id }));
    const correlationId = String(message.properties.correlationId);
    channel.sendToQueue(String(message.properties.replyTo), body, { correlationId });
  });
  return { ...fake, calls: () => calls, close: () => connection.close() };
}

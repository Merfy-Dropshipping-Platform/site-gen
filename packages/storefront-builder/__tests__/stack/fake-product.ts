import amqplib from 'amqplib';
import { z } from 'zod';
import { BILLING_QUEUE } from '../../src/billing';
import { COLLECTIONS_PATTERN } from '../../src/catalog';
import { PRODUCT_QUEUE } from '../../src/snapshot';
import { startFakeAnalytics, type FakeAnalytics } from './fake-analytics';
import { STACK } from './stack';

// Подставной сервис product: отвечает на product.list и product.collections.storefront (блок 8 «Секций и SDK», часть
// 8а) так, как отвечает Nest (server-rmq.js): { err, response, isDisposed, id } на replyTo с тем же correlationId. Что
// отвечать магазину — задаёт тест, отдельно для товаров и коллекций: данные, неуспех, ошибка или тишина (тайм-аут).
export type ProductAnswer = 'ok' | 'fail' | 'error' | 'silent';

export interface FakeProducts {
  answers: Map<string, ProductAnswer>;
  products: Map<string, Record<string, unknown>[]>;
  collectionAnswers: Map<string, ProductAnswer>;
  collections: Map<string, Record<string, unknown>[]>;
  // Сколько раз спросили product.list.
  calls: () => number;
  // Подставной сборщик аналитики (блок 11) стартует вместе с product: сборки всех тестов стенда получают ответ.
  analytics: FakeAnalytics;
  close: () => Promise<void>;
}

const requestSchema = z.object({ pattern: z.string(), data: z.object({ siteId: z.string() }), id: z.string() });

type Reply = { err: unknown; response: unknown };
type Lists = Pick<FakeProducts, 'answers' | 'products' | 'collectionAnswers' | 'collections'>;

function replyOf(answer: ProductAnswer, data: Record<string, unknown>[]): Reply | null {
  const replies: Record<ProductAnswer, Reply | null> = {
    ok: { err: null, response: { success: true, data } },
    fail: { err: null, response: { success: false, message: 'база товаров недоступна' } },
    error: { err: { message: 'Internal server error' }, response: undefined },
    silent: null,
  };
  return replies[answer];
}

function replyFor(fake: Lists, pattern: string, siteId: string): Reply | null {
  if (pattern === COLLECTIONS_PATTERN)
    return replyOf(fake.collectionAnswers.get(siteId) ?? 'ok', fake.collections.get(siteId) ?? []);
  return replyOf(fake.answers.get(siteId) ?? 'ok', fake.products.get(siteId) ?? []);
}

export async function startFakeProducts(): Promise<FakeProducts> {
  const analytics = await startFakeAnalytics();
  const connection = await amqplib.connect(STACK.rabbitmqUrl);
  const channel = await connection.createChannel();
  await channel.assertQueue(PRODUCT_QUEUE, { durable: true });
  await channel.purgeQueue(PRODUCT_QUEUE);
  const fake: Lists = {
    answers: new Map<string, ProductAnswer>(),
    products: new Map<string, Record<string, unknown>[]>(),
    collectionAnswers: new Map<string, ProductAnswer>(),
    collections: new Map<string, Record<string, unknown>[]>(),
  };
  let calls = 0;
  await channel.consume(PRODUCT_QUEUE, (message) => {
    if (message === null) return;
    channel.ack(message);
    const request = requestSchema.parse(JSON.parse(message.content.toString('utf8')));
    if (request.pattern !== COLLECTIONS_PATTERN) calls += 1;
    const reply = replyFor(fake, request.pattern, request.data.siteId);
    if (reply === null) return;
    const body = Buffer.from(JSON.stringify({ ...reply, isDisposed: true, id: request.id }));
    const correlationId = String(message.properties.correlationId);
    channel.sendToQueue(String(message.properties.replyTo), body, { correlationId });
  });
  // Подставной billing (часть 4 блока 1 «Секций и SDK»): get_public — оплата онлайн не подключена, как у нового магазина.
  await channel.assertQueue(BILLING_QUEUE, { durable: true });
  await channel.purgeQueue(BILLING_QUEUE);
  await channel.consume(BILLING_QUEUE, (message) => {
    if (message === null) return;
    channel.ack(message);
    const { id } = z.object({ id: z.string() }).parse(JSON.parse(message.content.toString('utf8')));
    const response = { success: true, yookassaEnabled: false, yookassaShopId: null, activeProvider: null };
    const body = Buffer.from(JSON.stringify({ err: null, response, isDisposed: true, id }));
    const correlationId = String(message.properties.correlationId);
    channel.sendToQueue(String(message.properties.replyTo), body, { correlationId });
  });
  const close = async (): Promise<void> => {
    await analytics.close();
    await connection.close();
  };
  return { ...fake, analytics, calls: () => calls, close };
}

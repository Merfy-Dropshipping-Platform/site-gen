import amqplib from 'amqplib';
import { z } from 'zod';
import { ANALYTICS_QUEUE } from '../../src/counters';
import { STACK } from './stack';

// Подставной analytics-collector на стенде: отвечает на analytics.pixels.list так, как его сервер RPC на Go
// (internal/rpc/rpc.go): { success, data } без обёртки Nest, на replyTo с тем же correlationId. Счётчики магазина и
// ответ задаёт тест; по умолчанию — пустой список: сборки остальных тестов стенда идут как раньше.
export type AnalyticsAnswer = 'ok' | 'fail' | 'silent';

export interface FakePixel {
  id: string;
  pixel_type: string;
  pixel_id: string;
  is_active: boolean;
}

export interface FakeAnalytics {
  answers: Map<string, AnalyticsAnswer>;
  pixels: Map<string, FakePixel[]>;
  calls: () => number;
  close: () => Promise<void>;
}

const requestSchema = z.object({ pattern: z.string(), data: z.object({ shopId: z.string(), tenantId: z.string() }) });

function replyFor(fake: Pick<FakeAnalytics, 'answers' | 'pixels'>, shopId: string): unknown {
  const replies: Record<AnalyticsAnswer, unknown> = {
    ok: { success: true, data: { pixels: fake.pixels.get(shopId) ?? [] } },
    fail: { success: false, error: 'база счётчиков недоступна' },
    silent: null,
  };
  return replies[fake.answers.get(shopId) ?? 'ok'];
}

export async function startFakeAnalytics(): Promise<FakeAnalytics> {
  const connection = await amqplib.connect(STACK.rabbitmqUrl);
  const channel = await connection.createChannel();
  await channel.assertQueue(ANALYTICS_QUEUE, { durable: true });
  await channel.purgeQueue(ANALYTICS_QUEUE);
  const fake = { answers: new Map<string, AnalyticsAnswer>(), pixels: new Map<string, FakePixel[]>() };
  let calls = 0;
  await channel.consume(ANALYTICS_QUEUE, (message) => {
    if (message === null) return;
    channel.ack(message);
    calls += 1;
    const request = requestSchema.parse(JSON.parse(message.content.toString('utf8')));
    const reply = replyFor(fake, request.data.shopId);
    if (reply === null) return;
    const correlationId = String(message.properties.correlationId);
    channel.sendToQueue(String(message.properties.replyTo), Buffer.from(JSON.stringify(reply)), { correlationId });
  });
  return { ...fake, calls: () => calls, close: () => connection.close() };
}

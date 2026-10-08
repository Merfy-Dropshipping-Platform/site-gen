import { randomUUID } from 'node:crypto';
import * as amqp from 'amqp-connection-manager';
import type { ConsumeMessage } from 'amqplib';
import { z } from 'zod';
import { StorefrontBuilderError } from './errors';

// Вызов сервиса по RabbitMQ так, как зовёт ClientProxy Nest (@nestjs/microservices 11, client-rmq.js): сообщение
// { pattern, data, id } в очередь сервиса, ответ — на прямой адрес amq.rabbitmq.reply-to с тем же correlationId,
// тело ответа — { err, response, isDisposed, id }. Так сборщик берёт товары у сервиса product (product.list), не
// поднимая Nest.

const REPLY_TO = 'amq.rabbitmq.reply-to';
const replySchema = z.object({ err: z.unknown().optional(), response: z.unknown().optional() });

export type Call = (queue: string, pattern: string, data: unknown, timeoutMs: number) => Promise<unknown>;

export interface RpcClient {
  call: Call;
  close: () => Promise<void>;
}

interface Waiter {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

function parseReply(message: ConsumeMessage): z.infer<typeof replySchema> {
  try {
    return replySchema.parse(JSON.parse(message.content.toString('utf8')));
  } catch (error) {
    throw new StorefrontBuilderError('rpc-failed', 'ответ сервиса не JSON', { cause: error });
  }
}

function answer(message: ConsumeMessage): unknown {
  const reply = parseReply(message);
  if ((reply.err ?? null) === null) return reply.response;
  throw new StorefrontBuilderError('rpc-failed', 'сервис ответил ошибкой', { cause: reply.err });
}

// Ответ пришёл — отдать его тому, кто ждёт этот correlationId. Ответов без ждущего (поздних, после тайм-аута) не ждём.
function settle(waiters: Map<string, Waiter>, message: ConsumeMessage): void {
  const id = String(message.properties.correlationId);
  const waiter = waiters.get(id);
  if (waiter === undefined) return;
  waiters.delete(id);
  try {
    waiter.resolve(answer(message));
  } catch (error) {
    waiter.reject(error instanceof Error ? error : new Error(String(error)));
  }
}

function timeoutError(pattern: string, timeoutMs: number): StorefrontBuilderError {
  return new StorefrontBuilderError('rpc-failed', `нет ответа за ${timeoutMs} мс`, { path: pattern });
}

export function openRpc(url: string): RpcClient {
  const connection = amqp.connect([url]);
  const waiters = new Map<string, Waiter>();
  const channel = connection.createChannel();
  const ready = channel.consume(REPLY_TO, (message) => settle(waiters, message), { noAck: true });
  const call: Call = async (queue, pattern, data, timeoutMs) => {
    await ready;
    const id = randomUUID();
    const reply = new Promise<unknown>((resolve, reject) => waiters.set(id, { resolve, reject }));
    const timer = setTimeout(() => waiters.get(id)?.reject(timeoutError(pattern, timeoutMs)), timeoutMs);
    const options = { replyTo: REPLY_TO, correlationId: id, contentType: 'application/json' };
    await channel.sendToQueue(queue, Buffer.from(JSON.stringify({ pattern, data, id })), options);
    return reply.finally(() => {
      clearTimeout(timer);
      waiters.delete(id);
    });
  };
  // Сначала канал, потом соединение: закрытые разом, они ждут друг друга.
  const close = async (): Promise<void> => {
    await channel.close();
    await connection.close();
  };
  return { call, close };
}

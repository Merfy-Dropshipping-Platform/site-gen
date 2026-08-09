#!/usr/bin/env node
// Generic RPC-вызов в sites_queue (протокол Nest RMQ). Только локальный контур.
// Использование: node theme-registry/rpc-call.mjs <pattern> '<json-data>'
import amqplib from 'amqplib';
import { randomUUID } from 'node:crypto';

const [pattern, dataJson] = [process.argv[2], process.argv[3] ?? '{}'];
if (!pattern) {
  console.error("usage: node theme-registry/rpc-call.mjs <pattern> '<json-data>'");
  process.exit(2);
}

const url = process.env.RABBITMQ_URL ?? 'amqp://rabbitmq:password@localhost:5672';
const conn = await amqplib.connect(url);
const ch = await conn.createChannel();
const { queue: replyTo } = await ch.assertQueue('', { exclusive: true });
const correlationId = randomUUID();
const payload = { pattern, data: JSON.parse(dataJson), id: correlationId };

const answer = new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('RPC timeout 45s')), 45000);
  ch.consume(replyTo, (m) => {
    if (m?.properties.correlationId === correlationId) {
      clearTimeout(t);
      res(JSON.parse(m.content.toString()));
    }
  }, { noAck: true });
});

ch.sendToQueue('sites_queue', Buffer.from(JSON.stringify(payload)), { correlationId, replyTo });
const r = await answer;
console.log(JSON.stringify(r, null, 2));
await conn.close();
process.exit((r?.response?.success ?? r?.success) ? 0 : 1);

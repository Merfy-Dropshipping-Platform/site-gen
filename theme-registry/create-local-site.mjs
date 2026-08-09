#!/usr/bin/env node
// Создать ЛОКАЛЬНЫЙ сайт нужной темы через RPC sites.create_site — тот же канал,
// которым пользуется gateway (RabbitMQ, очередь sites_queue). Только локальный контур.
// Использование: node theme-registry/create-local-site.mjs <themeId> [name]
import amqplib from 'amqplib';
import { randomUUID } from 'node:crypto';

const themeId = process.argv[2];
const name = process.argv[3] ?? `${themeId} local (registry)`;
if (!themeId) {
  console.error('usage: node theme-registry/create-local-site.mjs <themeId> [name]');
  process.exit(2);
}

// Креды локального RabbitMQ — как в .env.local сервиса.
const url = process.env.RABBITMQ_URL ?? 'amqp://rabbitmq:password@localhost:5672';
const conn = await amqplib.connect(url);
const ch = await conn.createChannel();
const { queue: replyTo } = await ch.assertQueue('', { exclusive: true });
const correlationId = randomUUID();

// Envelope протокола Nest RMQ: {pattern, data, id}; ответ {response, err, isDisposed, id}.
const payload = {
  pattern: 'sites.create_site',
  data: {
    // Тенант: по умолчанию локальный тест-тенант (его billing-план не упирается в
    // лимит 1 сайт, у него уже 6). Переопределяется REGISTRY_TENANT_ID.
    tenantId: process.env.REGISTRY_TENANT_ID ?? 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    actorUserId: 'theme-registry-local',
    name,
    themeId,
  },
  id: correlationId,
};

const answer = new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('RPC timeout 30s')), 30000);
  ch.consume(
    replyTo,
    (m) => {
      if (m?.properties.correlationId === correlationId) {
        clearTimeout(t);
        res(JSON.parse(m.content.toString()));
      }
    },
    { noAck: true },
  );
});

ch.sendToQueue('sites_queue', Buffer.from(JSON.stringify(payload)), { correlationId, replyTo });
const r = await answer;
console.log(JSON.stringify(r, null, 2));
await conn.close();
const ok = r?.response?.success ?? r?.success;
process.exit(ok ? 0 : 1);

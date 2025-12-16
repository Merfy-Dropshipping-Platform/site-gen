/**
 * Тестовый скрипт для публикации сайта с продуктами
 * Запуск: cd sites && node test-publish-site.js
 */

const amqp = require('amqplib');
const pg = require('pg');
const { randomUUID } = require('crypto');

const RABBITMQ_URL = 'amqp://rabbitmq:password@localhost:5672';
const SITES_QUEUE = 'sites_queue';

const siteId = 'ba155b36-689d-401c-84c2-7c85bcc11b57';
const tenantId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const subdomain = '6vozi7lv03kn';
const publicUrl = `https://${subdomain}.merfy.ru`;

const revisionContent = {
  content: [
    { type: 'Hero', props: { title: 'Демо-магазин', description: 'Магазин с тестовыми товарами', align: 'center' } },
    { type: 'ProductGrid', props: { title: 'Наши товары', columns: 3 } }
  ],
  meta: { title: 'Демо-магазин с товарами', description: 'Тестовый магазин Merfy' }
};

async function sendNestJsRpc(channel, queue, pattern, data) {
  const replyQueue = await channel.assertQueue('', { exclusive: true, autoDelete: true });
  const correlationId = randomUUID();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('RPC timeout')), 60000);

    channel.consume(replyQueue.queue, (msg) => {
      if (msg && msg.properties.correlationId === correlationId) {
        clearTimeout(timeout);
        const response = JSON.parse(msg.content.toString());
        // NestJS wraps response in { response: ..., isDisposed: bool, id: ... }
        resolve(response.response ?? response);
      }
    }, { noAck: true });

    // NestJS microservice message format
    const message = {
      pattern,
      data,
      id: correlationId
    };

    channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
      correlationId,
      replyTo: replyQueue.queue,
      contentType: 'application/json'
    });
  });
}

async function main() {
  const client = new pg.Client({ connectionString: 'postgresql://postgres:postgres123@localhost:5432/sites_service' });
  let connection, channel;

  try {
    // 1. Подключаемся к PostgreSQL
    await client.connect();
    console.log('✓ Connected to PostgreSQL');

    // 2. Устанавливаем publicUrl для сайта (чтобы генератор загрузил в правильный путь)
    await client.query('UPDATE site SET public_url = $1, updated_at = NOW() WHERE id = $2', [publicUrl, siteId]);
    console.log('✓ Set publicUrl:', publicUrl);

    // 3. Создаём ревизию
    const revisionId = randomUUID();
    await client.query(
      'INSERT INTO site_revision (id, site_id, data, meta, created_at) VALUES ($1, $2, $3, $4, NOW())',
      [revisionId, siteId, JSON.stringify(revisionContent), JSON.stringify(revisionContent.meta)]
    );
    console.log('✓ Created revision:', revisionId);

    // 4. Обновляем сайт
    await client.query('UPDATE site SET current_revision_id = $1, updated_at = NOW() WHERE id = $2', [revisionId, siteId]);
    console.log('✓ Updated site with revision');

    // 5. Подключаемся к RabbitMQ
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    console.log('✓ Connected to RabbitMQ');

    // 6. Вызываем sites.build
    console.log('→ Calling sites.build (may take 30-60 sec)...');
    const result = await sendNestJsRpc(channel, SITES_QUEUE, 'sites.build', { tenantId, siteId, mode: 'production' });
    console.log('✓ Build result:', JSON.stringify(result, null, 2));

  } catch (err) {
    console.error('✗ Error:', err.message);
  } finally {
    await client.end();
    if (channel) await channel.close();
    if (connection) await connection.close();
  }
}

main();

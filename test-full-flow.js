/**
 * Тест полного flow: создание сайта → публикация → проверка
 */
const amqp = require('amqplib');
const { randomUUID } = require('crypto');

const RABBITMQ_URL = 'amqp://rabbitmq:password@localhost:5672';
const SITES_QUEUE = 'sites_queue';

const tenantId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const actorUserId = '11111111-1111-1111-1111-111111111111';

async function sendNestJsRpc(channel, queue, pattern, data) {
  const replyQueue = await channel.assertQueue('', { exclusive: true, autoDelete: true });
  const correlationId = randomUUID();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('RPC timeout')), 120000);

    channel.consume(replyQueue.queue, (msg) => {
      if (msg && msg.properties.correlationId === correlationId) {
        clearTimeout(timeout);
        const response = JSON.parse(msg.content.toString());
        resolve(response.response ?? response);
      }
    }, { noAck: true });

    const message = { pattern, data, id: correlationId };
    channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
      correlationId,
      replyTo: replyQueue.queue,
      contentType: 'application/json'
    });
  });
}

async function main() {
  let connection, channel;

  try {
    // 1. Подключаемся к RabbitMQ
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    console.log('✓ Connected to RabbitMQ');

    // 2. Создаём новый сайт
    console.log('→ Creating new site...');
    const createResult = await sendNestJsRpc(channel, SITES_QUEUE, 'sites.create_site', {
      tenantId,
      actorUserId,
      name: 'Тестовый магазин ' + Date.now(),
    });
    console.log('✓ Create result:', JSON.stringify(createResult, null, 2));

    if (!createResult.success) {
      throw new Error('Failed to create site: ' + createResult.message);
    }

    const siteId = createResult.siteId;
    const publicUrl = createResult.publicUrl;
    console.log('✓ Site created:', siteId);
    console.log('✓ Public URL:', publicUrl);

    // 3. Публикуем сайт (это создаст Coolify app + соберёт + загрузит в MinIO)
    console.log('→ Publishing site (this will create Coolify app + build + upload)...');
    const publishResult = await sendNestJsRpc(channel, SITES_QUEUE, 'sites.publish', {
      tenantId,
      siteId,
      mode: 'production',
    });
    console.log('✓ Publish result:', JSON.stringify(publishResult, null, 2));

    if (!publishResult.success) {
      throw new Error('Failed to publish site: ' + publishResult.message);
    }

    console.log('\n✅ Full flow completed!');
    console.log('🌐 Site URL:', publishResult.url || publicUrl);

  } catch (err) {
    console.error('✗ Error:', err.message);
  } finally {
    if (channel) await channel.close();
    if (connection) await connection.close();
  }
}

main();

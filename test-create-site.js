/**
 * Тестовый скрипт для проверки создания сайта через RabbitMQ RPC
 * Запуск: node test-create-site.js
 */
const amqp = require('amqplib');

async function testCreateSite() {
  const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://rabbitmq:password@localhost:5672';
  const QUEUE = 'sites_queue';

  console.log('Connecting to RabbitMQ...');
  const connection = await amqp.connect(RABBITMQ_URL);
  const channel = await connection.createChannel();

  // Создаём временную очередь для ответа
  const { queue: replyQueue } = await channel.assertQueue('', { exclusive: true });

  const correlationId = Math.random().toString(36).substring(7);

  const data = {
    tenantId: 'test-tenant-' + Date.now(),
    actorUserId: 'test-user-' + Date.now(),
    name: 'Тестовый магазин',
    companyName: 'Тестовая компания',
  };

  // NestJS RPC формат: { pattern, data, id }
  const payload = {
    pattern: 'sites.create_site',
    data: data,
    id: correlationId,
  };

  console.log('Sending create_site request:', data);

  // Отправляем запрос
  channel.sendToQueue(
    QUEUE,
    Buffer.from(JSON.stringify(payload)),
    {
      correlationId,
      replyTo: replyQueue,
      contentType: 'application/json',
    }
  );

  // Ждём ответ
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout waiting for response'));
    }, 30000);

    channel.consume(replyQueue, (msg) => {
      if (msg.properties.correlationId === correlationId) {
        clearTimeout(timeout);
        const response = JSON.parse(msg.content.toString());
        console.log('\nResponse:', JSON.stringify(response, null, 2));
        channel.close();
        connection.close();
        resolve(response);
      }
    }, { noAck: true });
  });
}

testCreateSite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });

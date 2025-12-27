/**
 * Триггер сборки для двух сайтов
 */
const amqp = require('amqplib');
const { randomUUID } = require('crypto');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://rabbitmq:password@localhost:5672';
const SITES_QUEUE = 'sites_queue';

const sites = [
  { siteId: '9ab7ee50-3556-4e15-9e56-79097470ea20', tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', subdomain: 'w4ucjfczdqbs' },
  { siteId: 'f84724ff-5e1b-4886-adcc-f0a083ed3020', tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', subdomain: '6vozi7lv03kn' },
];

async function sendRpc(channel, queue, pattern, data) {
  const replyQueue = await channel.assertQueue('', { exclusive: true, autoDelete: true });
  const correlationId = randomUUID();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('RPC timeout (120s)')), 120000);

    channel.consume(replyQueue.queue, (msg) => {
      if (msg && msg.properties.correlationId === correlationId) {
        clearTimeout(timeout);
        const response = JSON.parse(msg.content.toString());
        resolve(response.response ?? response);
      }
    }, { noAck: true });

    channel.sendToQueue(queue, Buffer.from(JSON.stringify({ pattern, data, id: correlationId })), {
      correlationId,
      replyTo: replyQueue.queue,
      contentType: 'application/json'
    });
  });
}

async function main() {
  let connection, channel;
  try {
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    console.log('Connected to RabbitMQ');

    for (const site of sites) {
      console.log(`\nBuilding ${site.subdomain}...`);
      const result = await sendRpc(channel, SITES_QUEUE, 'sites.build', {
        tenantId: site.tenantId,
        siteId: site.siteId,
        mode: 'production'
      });
      console.log(`${site.subdomain}: ${result.success ? 'OK' : 'FAILED'} - ${result.artifactUrl || result.message || ''}`);
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    if (channel) await channel.close();
    if (connection) await connection.close();
  }
}

main();

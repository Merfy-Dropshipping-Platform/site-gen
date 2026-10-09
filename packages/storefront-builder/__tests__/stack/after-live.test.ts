import amqplib from 'amqplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptIncoming } from '../../src/accept';
import { runBuildJob } from '../../src/build-job';
import type { Pages } from '../../src/indexnow';
import { PREVIEW_EXCHANGE, previewVia } from '../../src/preview';
import { openHarness, type Harness } from './builder';
import { startFakeProducts, type FakeProducts } from './fake-product';
import { STACK, insertSite, until } from './stack';

// Задача 9 на стенде: сигнал превью уходит в storefront.preview на каждое принятое событие; IndexNow зовётся после
// переключения указателя и только у магазинов для поиска.
interface Announced {
  publicUrl: string;
  previous: Pages;
  next: Pages;
}

let harness: Harness;
let products: FakeProducts;
const announced: Announced[] = [];

beforeAll(async () => {
  harness = openHarness({ indexable: true });
  harness.deps.announce = (publicUrl, previous, next) =>
    Promise.resolve(void announced.push({ publicUrl, previous, next }));
  harness.deps.preview = previewVia(harness.broker.publishPreview, harness.deps.log);
  products = await startFakeProducts();
});
afterAll(async () => {
  await products.close();
  await harness.close();
});

async function buildOnce(siteId: string, type: string): Promise<void> {
  await acceptIncoming(harness.deps, { owner: 'site', siteId, type, eventAt: new Date().toISOString() });
  const index = harness.queued.findIndex((job) => job.siteId === siteId);
  const [job] = harness.queued.splice(index, 1);
  await runBuildJob(harness.deps, job);
}

describe('после приёма и переключения', () => {
  it('сигнал превью: { shopId, entities } в storefront.preview', async () => {
    const connection = await amqplib.connect(STACK.rabbitmqUrl);
    const channel = await connection.createChannel();
    await channel.assertExchange(PREVIEW_EXCHANGE, 'fanout', { durable: true });
    const { queue } = await channel.assertQueue('', { exclusive: true });
    await channel.bindQueue(queue, PREVIEW_EXCHANGE, '');
    const site = await insertSite(harness.db);
    await acceptIncoming(harness.deps, {
      owner: 'site',
      siteId: site.id,
      type: 'policy-change',
      eventAt: new Date().toISOString(),
    });
    const bodies: unknown[] = [];
    await until(async () => {
      const message = await channel.get(queue, { noAck: true });
      if (message !== false) bodies.push(JSON.parse(message.content.toString('utf8')));
      return bodies.length > 0;
    });
    expect(bodies).toEqual([{ shopId: site.id, entities: ['data.policy'] }]);
    await connection.close();
  });

  it('IndexNow: первая выкладка — все страницы; правка имени — снова, с прошлыми страницами', async () => {
    const site = await insertSite(harness.db, { name: 'Пледы' });
    await buildOnce(site.id, 'merchant-publish');
    expect(announced.at(-1)?.previous).toEqual([]);
    expect(announced.at(-1)?.publicUrl).toBe(`https://${site.publicUrl}`);
    const first = announced.at(-1)?.next ?? [];
    await harness.db.query('UPDATE site SET name = $2 WHERE id = $1', [site.id, 'Пледы и шарфы']);
    await buildOnce(site.id, 'shop-name-change');
    expect(announced.at(-1)?.previous).toEqual(first);
  });

  it('магазин не для поиска — IndexNow не зовётся', async () => {
    harness.deps.indexable = false;
    const count = announced.length;
    const site = await insertSite(harness.db);
    await buildOnce(site.id, 'merchant-publish');
    expect(announced.length).toBe(count);
  });
});

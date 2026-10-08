import amqplib from 'amqplib';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EVENTS_QUEUE, JOBS_QUEUE } from '../../src/broker';
import { CONTENT_EXCHANGE, PRODUCT_EXCHANGE } from '../../src/events';
import { reconcileShops } from '../../src/reconcile';
import { enqueueVia, startRuntime, type Runtime } from '../../src/runtime';
import { liveHome, logged, openHarness, render, type Harness } from './builder';
import { startFakeProducts, type FakeProducts } from './fake-product';
import { STACK, insertSite, openPool, resetBuilder, shopRow, until, type SiteFields } from './stack';

// Сборщик целиком на стенде: события через RabbitMQ, задания через очередь, таймеры повторов. Это пункты 2, 3, 5 и 7
// раздела «Как проверить» design.md — у тебя в Docker; на dev их повторяет основной тред после выкатки.
let raw: amqplib.ChannelModel;
let channel: amqplib.Channel;
let products: FakeProducts;
const open: { harness: Harness; runtime: Runtime }[] = [];

beforeAll(async () => {
  raw = await amqplib.connect(STACK.rabbitmqUrl);
  channel = await raw.createChannel();
  products = await startFakeProducts();
});
afterAll(async () => {
  await products.close();
  await raw.close();
});
beforeEach(async () => {
  render.delayMs = 0;
  const db = openPool();
  await resetBuilder(db);
  await db.end();
  await channel.purgeQueue(EVENTS_QUEUE).catch(() => undefined);
  await channel.purgeQueue(JOBS_QUEUE).catch(() => undefined);
});
afterEach(async () => {
  for (const { harness, runtime } of open.splice(0)) {
    runtime.stop();
    await harness.close();
  }
});

async function startBuilder(leaseMs = 60_000): Promise<Harness> {
  const harness = openHarness();
  harness.deps.shopState = { leaseMs, retryDelaysMs: [100, 200] };
  harness.deps.enqueue = enqueueVia(harness.broker, harness.deps.log);
  const runtime = await startRuntime(harness.deps);
  open.push({ harness, runtime });
  return harness;
}

const labelOf = (site: SiteFields): string => (site.publicUrl ?? '').split('.')[0];

function publishEvent(siteId: string, type = 'shop-name-change'): void {
  const body = { v: 1, type, siteId, eventAt: new Date().toISOString(), source: 'test' };
  channel.publish(CONTENT_EXCHANGE, type, Buffer.from(JSON.stringify(body)));
}

interface BuildRow {
  outcome: string;
  events: number;
  started: Date;
  finished: Date;
}

async function builds(harness: Harness, siteId: string): Promise<BuildRow[]> {
  const sql = `SELECT outcome, events, started_at AS started, finished_at AS finished FROM storefront_build
    WHERE site_id = $1 ORDER BY build`;
  return (await harness.db.query<BuildRow>(sql, [siteId])).rows;
}

const idle = (harness: Harness, siteId: string) => async () => (await shopRow(harness.db, siteId)).state === 'idle';

describe('склейка по событиям', () => {
  it('сто правок подряд — не сто сборок: по одной за раз, все сто событий в сборках, последняя правка у покупателя', async () => {
    const harness = await startBuilder();
    const site = await insertSite(harness.db, { name: 'Правка 0' });
    render.delayMs = 200;
    for (let edit = 1; edit <= 100; edit += 1) {
      await harness.db.query('UPDATE site SET name = $2, updated_at = now() WHERE id = $1', [
        site.id,
        `Правка ${edit}`,
      ]);
      publishEvent(site.id);
    }
    await until(async () => (await builds(harness, site.id)).reduce((sum, row) => sum + row.events, 0) === 100);
    await until(idle(harness, site.id));
    const rows = await builds(harness, site.id);
    // Склеено: сборок меньше половины событий. Сколько именно — зависит от скорости машины.
    expect(rows.length).toBeLessThan(50);
    expect(rows.every((row, index) => index === 0 || row.started >= rows[index - 1].finished)).toBe(true);
    const queued = logged(harness.lines, 'job-queued').filter((line) => line.shopId === site.id);
    expect(queued).toHaveLength(rows.length);
    expect(await liveHome(harness.store, labelOf(site))).toContain('<h1>Правка 100</h1>');
  });

  it('событие товара — по организации: магазин новой темы собран, магазин нынешней темы не тронут', async () => {
    const harness = await startBuilder();
    const nova = await insertSite(harness.db);
    const rose = await insertSite(harness.db, { tenantId: nova.tenantId, themeId: 'rose' });
    const product = { event: 'product.updated', tenantId: nova.tenantId, productIds: ['p-1'] };
    channel.publish(PRODUCT_EXCHANGE, '', Buffer.from(JSON.stringify(product)));
    await until(async () => (await builds(harness, nova.id)).length === 1);
    expect(await builds(harness, rose.id)).toEqual([]);
    expect(await shopRow(harness.db, rose.id)).toEqual({});
  });

  it('событие магазина нынешней темы и черновика — в журнал «ignored», сборок нет', async () => {
    const harness = await startBuilder();
    const rose = await insertSite(harness.db, { themeId: 'rose' });
    const draft = await insertSite(harness.db, { status: 'draft' });
    publishEvent(rose.id);
    publishEvent(draft.id);
    await until(() => Promise.resolve(logged(harness.lines, 'event-ignored').length === 2));
    expect([...(await builds(harness, rose.id)), ...(await builds(harness, draft.id))]).toEqual([]);
  });
});

describe('перезапуск посреди сборки', () => {
  it('сборщик умер со сборкой и «ещё раз» — после срока замка сборка повторилась, правка дошла', async () => {
    const first = await startBuilder(1_500);
    const site = await insertSite(first.db, { name: 'До перезапуска' });
    render.hangOnce = true;
    publishEvent(site.id);
    await until(async () => (await shopRow(first.db, site.id)).state === 'busy');
    await until(() => Promise.resolve(logged(first.lines, 'build-start').length === 1));
    await first.db.query(`UPDATE site SET name = 'После перезапуска', updated_at = now() WHERE id = $1`, [site.id]);
    publishEvent(site.id);
    await until(async () => (await shopRow(first.db, site.id)).pending === 1);
    const crashed = open.splice(0, 1)[0];
    crashed.runtime.stop();
    await crashed.harness.broker.close();
    const second = await startBuilder(1_500);
    await until(idle(second, site.id), 15_000);
    expect(await liveHome(second.store, labelOf(site))).toContain('<h1>После перезапуска</h1>');
    expect(logged(second.lines, 'job-skipped')).toHaveLength(1);
    expect(await builds(second, site.id)).toMatchObject([{ outcome: 'live', events: 2 }]);
    await crashed.harness.rpc.close();
    await crashed.harness.db.end();
  });
});

describe('сверка раз в час', () => {
  it('правка без события — сверка находит расхождение ключей и ставит сборку', async () => {
    const harness = await startBuilder();
    const site = await insertSite(harness.db, { name: 'Было' });
    publishEvent(site.id);
    await until(async () => (await builds(harness, site.id)).length === 1);
    await until(idle(harness, site.id));
    await harness.db.query(`UPDATE site SET name = 'Стало', updated_at = now() WHERE id = $1`, [site.id]);
    expect(await reconcileShops(harness.deps)).toBeGreaterThanOrEqual(1);
    await until(async () => (await builds(harness, site.id)).length === 2);
    await until(idle(harness, site.id));
    expect(await liveHome(harness.store, labelOf(site))).toContain('<h1>Стало</h1>');
  });
});

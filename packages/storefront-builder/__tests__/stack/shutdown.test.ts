import amqplib from 'amqplib';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EVENTS_QUEUE, JOBS_QUEUE } from '../../src/broker';
import { CONTENT_EXCHANGE } from '../../src/events';
import { enqueueVia, startRuntime, type Runtime } from '../../src/runtime';
import { liveHome, logged, openHarness, render, type Harness } from './builder';
import { startFakeProducts, type FakeProducts } from './fake-product';
import { STACK, insertSite, openPool, resetBuilder, shopRow, until, wait, type SiteFields } from './stack';

// Штатная остановка сборщика (SIGTERM от Coolify, design.md блока 6, находка 3 от 10.10, «8. да снимай»): новых
// заданий не берём, идущую сборку ждём с пределом; не дождались — строка сборки «interrupted», замок снят, и следующий
// сборщик собирает сразу, а не через срок замка. Замок здесь — минута: «сразу» от «после срока» отличается явно.
const LEASE_MS = 60_000;
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
  Object.assign(render, { delayMs: 0, hangOnce: false, hangMs: 60_000 });
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

async function startBuilder(): Promise<{ harness: Harness; runtime: Runtime }> {
  const harness = openHarness();
  harness.deps.shopState = { leaseMs: LEASE_MS, retryDelaysMs: [100, 200] };
  harness.deps.enqueue = enqueueVia(harness.broker, harness.deps.log);
  const runtime = await startRuntime(harness.deps);
  open.push({ harness, runtime });
  return { harness, runtime };
}

const labelOf = (site: SiteFields): string => (site.publicUrl ?? '').split('.')[0];

function publishEvent(siteId: string): void {
  const body = { v: 1, type: 'shop-name-change', siteId, eventAt: new Date().toISOString(), source: 'test' };
  channel.publish(CONTENT_EXCHANGE, body.type, Buffer.from(JSON.stringify(body)));
}

interface BuildRow {
  build: number;
  outcome: string;
  events: number;
  error: string | null;
}

async function builds(harness: Harness, siteId: string): Promise<BuildRow[]> {
  const sql = `SELECT build::float8 AS build, outcome, events, error FROM storefront_build WHERE site_id = $1
    ORDER BY build`;
  return (await harness.db.query<BuildRow>(sql, [siteId])).rows;
}

const started =
  (harness: Harness, count = 1) =>
  () =>
    Promise.resolve(logged(harness.lines, 'build-start').length === count);
const idle = (harness: Harness, siteId: string) => async () => (await shopRow(harness.db, siteId)).state === 'idle';

describe('остановка посреди сборки', () => {
  it('не дождались — «interrupted», замок снят, второй сборщик собрал сразу со «ещё раз»; старая сборка не затёрла новую', async () => {
    const first = await startBuilder();
    const site = await insertSite(first.harness.db, { name: 'До остановки' });
    Object.assign(render, { hangOnce: true, hangMs: 4_000 });
    publishEvent(site.id);
    await until(started(first.harness));
    // Coolify при выкатке держит старый и новый контейнер разом: второй сборщик уже работает.
    const second = await startBuilder();
    await first.harness.db.query(`UPDATE site SET name = 'После остановки', updated_at = now() WHERE id = $1`, [
      site.id,
    ]);
    publishEvent(site.id);
    await until(async () => (await shopRow(first.harness.db, site.id)).pending === 1);

    const stoppedAt = Date.now();
    expect(await first.runtime.shutdown(200)).toBe(1);
    const [interrupted] = await builds(first.harness, site.id);
    expect(interrupted).toMatchObject({ outcome: 'interrupted', events: 1 });
    expect(interrupted.error).toContain('остановка сборщика');
    expect(logged(first.harness.lines, 'build-interrupted')).toMatchObject([
      { shopId: site.id, buildId: interrupted.build },
    ]);

    // Второй сборщик взял задание в ближайший обход — не через минуту замка; оба события в одной сборке.
    await until(idle(second.harness, site.id), 10_000);
    expect(Date.now() - stoppedAt).toBeLessThan(10_000);
    const rows = await builds(second.harness, site.id);
    expect(rows).toMatchObject([
      { outcome: 'interrupted', events: 1 },
      { outcome: 'live', events: 2 },
    ]);
    expect(rows[1].build).toBeGreaterThan(rows[0].build);
    expect(logged(second.harness.lines, 'build-start')).toHaveLength(1);
    expect(await liveHome(second.harness.store, labelOf(site))).toContain('<h1>После остановки</h1>');

    // В тесте процесс первого не выходит: прерванная сборка дорисовывает и выкладывает свой номер — указатель пишется
    // только если новее, строка магазина уже не её.
    await until(() => Promise.resolve(logged(first.harness.lines, 'build-lost').length === 1), 15_000);
    expect(await liveHome(second.harness.store, labelOf(site))).toContain('<h1>После остановки</h1>');
    expect(await builds(second.harness, site.id)).toHaveLength(2);
    expect(await shopRow(second.harness.db, site.id)).toMatchObject({ state: 'idle', pending: 0 });
  });

  it('один сборщик: перезапуск — следующий процесс собирает сразу', async () => {
    const first = await startBuilder();
    const site = await insertSite(first.harness.db, { name: 'Один сборщик' });
    Object.assign(render, { hangOnce: true, hangMs: 3_000 });
    publishEvent(site.id);
    await until(started(first.harness));
    expect(await first.runtime.shutdown(100)).toBe(1);
    expect(await shopRow(first.harness.db, site.id)).toMatchObject({ state: 'busy', pending: 0, events: 1 });

    const stoppedAt = Date.now();
    const next = await startBuilder();
    await until(async () => (await builds(next.harness, site.id)).some((row) => row.outcome === 'live'), 10_000);
    expect(Date.now() - stoppedAt).toBeLessThan(10_000);
    expect(await builds(next.harness, site.id)).toMatchObject([
      { outcome: 'interrupted', events: 1 },
      { outcome: 'live', events: 1 },
    ]);
    await until(() => Promise.resolve(logged(first.harness.lines, 'build-lost').length === 1), 15_000);
  });

  it('сборка успела за предел — дождались: «interrupted» нет, магазин свободен', async () => {
    const { harness, runtime } = await startBuilder();
    const site = await insertSite(harness.db);
    render.delayMs = 300;
    publishEvent(site.id);
    await until(started(harness));
    expect(await runtime.shutdown(15_000)).toBe(0);
    expect(await builds(harness, site.id)).toMatchObject([{ outcome: 'live', events: 1 }]);
    expect(await shopRow(harness.db, site.id)).toMatchObject({ state: 'idle' });
    expect(logged(harness.lines, 'build-interrupted')).toEqual([]);
  });
});

describe('остановка без идущих сборок', () => {
  it('ничего лишнего: строки не тронуты, новых событий и заданий не берёт', async () => {
    const { harness, runtime } = await startBuilder();
    const site = await insertSite(harness.db);
    publishEvent(site.id);
    await until(async () => (await builds(harness, site.id)).length === 1);
    await until(idle(harness, site.id));
    const before = { shop: await shopRow(harness.db, site.id), builds: await builds(harness, site.id) };
    const linesBefore = harness.lines.length;

    const stoppedAt = Date.now();
    expect(await runtime.shutdown(15_000)).toBe(0);
    expect(Date.now() - stoppedAt).toBeLessThan(1_000);
    expect(await shopRow(harness.db, site.id)).toEqual(before.shop);
    expect(await builds(harness, site.id)).toEqual(before.builds);
    expect(harness.lines.slice(linesBefore)).toEqual([]);

    publishEvent(site.id);
    await wait(1_000);
    expect(logged(harness.lines, 'event-accepted')).toHaveLength(1);
    expect(await shopRow(harness.db, site.id)).toEqual(before.shop);
  });
});

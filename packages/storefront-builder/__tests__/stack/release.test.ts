import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PRIORITY } from '../../src/events';
import { enqueueVia, startRuntime, type Runtime } from '../../src/runtime';
import {
  acceptEvent,
  claimJob,
  finishSuccess,
  holdRelease,
  startHeldReleases,
  type ShopStateOptions,
} from '../../src/shop-state';
import { logged, openHarness, render, type Harness } from './builder';
import { startFakeProducts, type FakeProducts } from './fake-product';
import { insertSite, openPool, resetBuilder, shopRow, until, type SiteFields } from './stack';

// Предел выпуска K (design.md блока 6, В6-2 В): одна очередь с приоритетом, а выпуск темы подаёт задания порциями — в
// работе не больше K заданий выпуска, K меньше числа мест. Волна не занимает все места: публикации остаётся место.
let db: Pool;
let products: FakeProducts;
beforeAll(async () => {
  db = openPool();
  products = await startFakeProducts();
});
afterAll(async () => {
  await products.close();
  await db.end();
});
beforeEach(async () => {
  render.delayMs = 0;
  await resetBuilder(db);
});

const OPTIONS: ShopStateOptions = { leaseMs: 60_000, retryDelaysMs: [100, 200] };
// Время правки i-го магазина волны: порядок прихода задаёт порядок постановки.
const at = (index: number): string => new Date(Date.UTC(2026, 9, 8, 10, 0, index)).toISOString();
const release = (siteId: string, index: number) => ({ siteId, priority: PRIORITY.release, eventAt: at(index) });

describe('строка магазина: выпуск ждёт места', () => {
  it('пять выпусков при K = 2 — два задания по порядку прихода, три ждут; конец сборки — место следующему', async () => {
    const shops = Array.from({ length: 5 }, () => randomUUID());
    const held = await Promise.all(shops.map((siteId, index) => holdRelease(db, release(siteId, index), OPTIONS)));
    expect(held.every((accepted) => accepted.outcome === 'held')).toBe(true);
    const first = await startHeldReleases(db, OPTIONS, 2);
    expect(first.map((job) => job.siteId).sort()).toEqual([shops[0], shops[1]].sort());
    expect(first.every((job) => job.priority === PRIORITY.release)).toBe(true);
    expect(await startHeldReleases(db, OPTIONS, 2)).toEqual([]);
    const claimed = await claimJob(db, first[0], OPTIONS.leaseMs);
    expect(claimed).not.toBeNull();
    await finishSuccess(db, first[0], OPTIONS);
    expect((await startHeldReleases(db, OPTIONS, 2)).map((job) => job.siteId)).toEqual([shops[2]]);
    expect(await shopRow(db, shops[4])).toMatchObject({ state: 'held', pending: 1 });
  });

  it('публикация магазина из волны — сразу, с приоритетом публикации, места выпуска не ждёт', async () => {
    const [busy, waiting] = [randomUUID(), randomUUID()];
    await holdRelease(db, release(busy, 0), OPTIONS);
    await holdRelease(db, release(waiting, 1), OPTIONS);
    await startHeldReleases(db, OPTIONS, 1);
    const publish = { siteId: waiting, priority: PRIORITY.publish, eventAt: at(2) };
    expect(await acceptEvent(db, publish, OPTIONS)).toMatchObject({ outcome: 'started', priority: PRIORITY.publish });
    expect(await shopRow(db, waiting)).toMatchObject({ state: 'busy', events: 2, pending: 0 });
  });

  it('десять копий сборщика ставят порцию разом — в работе всё равно не больше K', async () => {
    const shops = Array.from({ length: 6 }, () => randomUUID());
    for (const [index, siteId] of shops.entries()) await holdRelease(db, release(siteId, index), OPTIONS);
    const batches = await Promise.all(Array.from({ length: 10 }, () => startHeldReleases(db, OPTIONS, 2)));
    expect(batches.flat()).toHaveLength(2);
  });
});

describe('сборщик целиком: волна выпуска и публикация', () => {
  const open: { harness: Harness; runtime: Runtime }[] = [];
  afterEach(async () => {
    for (const { harness, runtime } of open.splice(0)) {
      runtime.stop();
      await harness.close();
    }
  });

  async function startBuilder(slots: number): Promise<Harness> {
    const harness = openHarness({ slots, releaseSlots: Math.max(1, slots - 1) });
    harness.deps.enqueue = enqueueVia(harness.broker, harness.deps.log);
    open.push({ harness, runtime: await startRuntime(harness.deps) });
    return harness;
  }

  async function send(harness: Harness, site: SiteFields, type: string): Promise<void> {
    await harness.broker.publishEvent({ type, siteId: site.id, eventAt: new Date().toISOString(), source: 'test' });
  }

  interface BuildTimes {
    started: Date;
    finished: Date;
  }

  async function builds(siteIds: string[]): Promise<BuildTimes[]> {
    const sql = `SELECT started_at AS started, finished_at AS finished FROM storefront_build
      WHERE site_id = ANY($1) ORDER BY started_at`;
    return (await db.query<BuildTimes>(sql, [siteIds])).rows;
  }

  // Волна из трёх магазинов, сборка — 400 мс; публикация четвёртого — когда первая сборка волны уже идёт.
  async function waveThenPublish(harness: Harness): Promise<{ wave: BuildTimes[]; publish: BuildTimes }> {
    const wave = [await insertSite(db), await insertSite(db), await insertSite(db)];
    const shop = await insertSite(db);
    render.delayMs = 400;
    for (const site of wave) await send(harness, site, 'theme-release');
    await until(() => Promise.resolve(logged(harness.lines, 'build-start').length === 1));
    await send(harness, shop, 'merchant-publish');
    await until(async () => (await builds(wave.map((site) => site.id))).length === 3, 30_000);
    await until(async () => (await builds([shop.id])).length === 1);
    const [publish] = await builds([shop.id]);
    return { wave: await builds(wave.map((site) => site.id)), publish };
  }

  const oneAtATime = (rows: BuildTimes[]): boolean =>
    rows.every((row, index) => index === 0 || row.started >= rows[index - 1].finished);

  it('два места, K = 1: волна идёт по одному, публикация берёт свободное место, не дожидаясь волны', async () => {
    const { wave, publish } = await waveThenPublish(await startBuilder(2));
    expect(oneAtATime(wave)).toBe(true);
    expect(publish.started.getTime()).toBeLessThan(wave[0].finished.getTime());
  });

  it('одно место (dev), K = 1: публикация ждёт не дольше одной сборки выпуска — той, что уже шла', async () => {
    const { wave, publish } = await waveThenPublish(await startBuilder(1));
    expect(oneAtATime([...wave, publish].sort((left, right) => left.started.getTime() - right.started.getTime()))).toBe(
      true,
    );
    expect(publish.started.getTime()).toBeGreaterThanOrEqual(wave[0].finished.getTime());
    expect(publish.started.getTime()).toBeLessThanOrEqual(wave[1].started.getTime());
  });
});

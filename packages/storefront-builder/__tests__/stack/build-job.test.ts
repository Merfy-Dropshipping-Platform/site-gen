import amqplib from 'amqplib';
import { readPointer } from '@merfy/storefront-storage';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { acceptIncoming } from '../../src/accept';
import { ACTIVITY_EXCHANGE } from '../../src/broker';
import { runBuildJob } from '../../src/build-job';
import { startDueRetries, type StartedJob } from '../../src/shop-state';
import { liveHome, logged, openHarness, render, type Harness } from './builder';
import { startFakeProducts, type FakeProducts } from './fake-product';
import { STACK, insertSite, shopRow, wait, type SiteFields } from './stack';

// Одно задание сборки на стенде: снимок → ключ → сборка блока 4 → выкладка блока 5 → строка сборки и строка магазина.
let harness: Harness;
let products: FakeProducts;

beforeAll(async () => {
  harness = openHarness();
  products = await startFakeProducts();
});
afterAll(async () => {
  await products.close();
  await harness.close();
});
beforeEach(() => {
  render.delayMs = 0;
});

const labelOf = (site: SiteFields): string => (site.publicUrl ?? '').split('.')[0];

async function event(siteId: string, type = 'shop-name-change'): Promise<void> {
  const eventAt = new Date().toISOString();
  await acceptIncoming(harness.deps, { owner: 'site', siteId, type, eventAt });
}

// Взять из очереди теста следующее задание магазина и собрать его.
async function runNext(siteId: string): Promise<StartedJob> {
  const index = harness.queued.findIndex((job) => job.siteId === siteId);
  const [job] = harness.queued.splice(index, 1);
  await runBuildJob(harness.deps, job);
  return job;
}

async function buildRow(siteId: string, build: number): Promise<Record<string, unknown>> {
  const sql = `SELECT outcome, events, attempt, priority, steps, error FROM storefront_build WHERE site_id = $1 AND build = $2`;
  const { rows } = await harness.db.query<Record<string, unknown>>(sql, [siteId, build]);
  return rows[0] ?? {};
}

describe('сборка: правка доходит до витрины', () => {
  it('первая сборка — указатель на неё, главная с именем магазина, строка сборки со временем шагов', async () => {
    const site = await insertSite(harness.db, { name: 'Шарфы' });
    await event(site.id);
    const job = await runNext(site.id);
    expect(await readPointer(harness.store, labelOf(site))).toMatchObject({ shop: site.id, build: job.build });
    expect(await liveHome(harness.store, labelOf(site))).toContain('<h1>Шарфы</h1>');
    const row = await buildRow(site.id, job.build);
    expect(row).toMatchObject({ outcome: 'live', events: 1, attempt: 0, priority: 2, error: null });
    expect(Object.keys(row.steps ?? {}).sort()).toEqual(['build', 'compare', 'queue', 'snapshot']);
    const steps = logged(harness.lines, 'step').filter((line) => line.shopId === site.id);
    expect(steps.map((line) => line.step)).toEqual(['snapshot', 'compare', 'build']);
    expect(steps[0]).toMatchObject({ buildId: job.build, shopId: site.id });
    expect([typeof steps[0].ms, typeof steps[0].queueWaitMs]).toEqual(['number', 'number']);
    expect(await shopRow(harness.db, site.id)).toMatchObject({ state: 'idle' });
  });

  it('ничего не поменялось — ключ совпал с живой: skipped, указатель тот же', async () => {
    const site = await insertSite(harness.db);
    await event(site.id);
    const first = await runNext(site.id);
    await event(site.id);
    const second = await runNext(site.id);
    expect(await buildRow(site.id, second.build)).toMatchObject({ outcome: 'skipped' });
    expect(await readPointer(harness.store, labelOf(site))).toMatchObject({ build: first.build });
  });

  it('новое имя — новая сборка, у покупателя новое имя', async () => {
    const site = await insertSite(harness.db, { name: 'Старое имя' });
    await event(site.id);
    await runNext(site.id);
    await harness.db.query(`UPDATE site SET name = 'Новое имя', updated_at = now() WHERE id = $1`, [site.id]);
    await event(site.id);
    const second = await runNext(site.id);
    expect(await readPointer(harness.store, labelOf(site))).toMatchObject({ build: second.build });
    expect(await liveHome(harness.store, labelOf(site))).toContain('<h1>Новое имя</h1>');
  });

  // Владелец 08.10: «SEO-описание пользователь может не заполнить, но при этом сайт должен работать».
  it('мерчант не заполнил имя и SEO-описание — магазин у покупателя: заголовок — адрес, тега description нет', async () => {
    const site = await insertSite(harness.db, { name: '' });
    await event(site.id);
    const job = await runNext(site.id);
    expect(await buildRow(site.id, job.build)).toMatchObject({ outcome: 'live', error: null });
    const home = await liveHome(harness.store, labelOf(site));
    expect(home).toContain(`<title>${site.publicUrl ?? ''}</title>`);
    expect(home).not.toContain('name="description"');
  });

  // Владелец 08.10: что мерчант заполнил, то и работает — SEO из настроек магазина (branding.seo) у покупателя.
  it('мерчант заполнил SEO-заголовок, описание и ключевые слова — всё на главной у покупателя', async () => {
    const site = await insertSite(harness.db);
    const seo = { title: 'Шарфы изо льна', description: 'Льняные шарфы', keywords: 'шарфы, лён' };
    await harness.db.query('UPDATE site SET branding = $2 WHERE id = $1', [site.id, JSON.stringify({ seo })]);
    await event(site.id);
    await runNext(site.id);
    const home = await liveHome(harness.store, labelOf(site));
    expect(home).toContain('<title>Шарфы изо льна</title>');
    expect(home).toContain('<meta name="description" content="Льняные шарфы">');
    expect(home).toContain('<meta name="keywords" content="шарфы, лён">');
    expect(home).toContain('<h1>Шарфы</h1>');
  });

  it('правка во время сборки — «ещё раз»: сразу после текущей ровно одно следующее задание', async () => {
    const site = await insertSite(harness.db);
    await event(site.id);
    render.delayMs = 300;
    const running = runNext(site.id);
    await wait(150);
    await Promise.all([1, 2, 3].map(() => event(site.id)));
    await running;
    const next = harness.queued.filter((job) => job.siteId === site.id);
    expect(next).toHaveLength(1);
    expect(await shopRow(harness.db, site.id)).toMatchObject({ state: 'busy', events: 3, pending: 0 });
  });
});

describe('сбой: живой сайт не тронут, повторы, тревога', () => {
  it('товары не пришли — сборка упала, указатель прежний; три запуска — «остановлено» и запись critical', async () => {
    const raw = await amqplib.connect(STACK.rabbitmqUrl);
    const channel = await raw.createChannel();
    const { queue } = await channel.assertQueue('', { exclusive: true });
    await channel.bindQueue(queue, ACTIVITY_EXCHANGE, 'site.build_stopped');
    const site = await insertSite(harness.db);
    await event(site.id);
    const live = await runNext(site.id);
    products.answers.set(site.id, 'fail');
    await harness.db.query(`UPDATE site SET name = 'Не дойдёт', updated_at = now() WHERE id = $1`, [site.id]);
    await event(site.id);
    const failed = await runNext(site.id);
    const failedRow = await buildRow(site.id, failed.build);
    expect(failedRow.outcome).toBe('failed');
    expect(String(failedRow.error)).toMatch(/не получен/);
    expect(await readPointer(harness.store, labelOf(site))).toMatchObject({ build: live.build });
    expect(await shopRow(harness.db, site.id)).toMatchObject({ state: 'retrying', attempt: 1 });
    await wait(150);
    harness.queued.push(...(await startDueRetries(harness.db, harness.deps.shopState)));
    await runNext(site.id);
    await wait(250);
    harness.queued.push(...(await startDueRetries(harness.db, harness.deps.shopState)));
    await runNext(site.id);
    expect(await shopRow(harness.db, site.id)).toMatchObject({ state: 'stopped', attempt: 3 });
    expect(logged(harness.lines, 'ALERT').filter((line) => line.shopId === site.id)).toHaveLength(1);
    const message = await channel.get(queue, { noAck: true });
    expect(message && JSON.parse(message.content.toString('utf8'))).toMatchObject({
      severity: 'critical',
      category: 'site',
      action: 'build_stopped',
      organizationId: site.tenantId,
      siteId: site.id,
      payload: { meta: { attempts: 3 } },
    });
    expect(await liveHome(harness.store, labelOf(site))).not.toContain('Не дойдёт');
    await raw.close();
  });
});

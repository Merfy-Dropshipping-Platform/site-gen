import { createHash } from 'node:crypto';
import type { Server } from 'node:http';
import { drawnKey, parseDrawnList, readObject } from '@merfy/storefront-storage';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { portOf, startDrawServer, type DrawDeps } from '../../src/draw';
import { enqueueVia, startRuntime, type Runtime } from '../../src/runtime';
import { createSlots } from '../../src/slots';
import { RENDER_HASH, logged, openHarness, render, type Harness } from './builder';
import { startFakeProducts, type FakeProducts } from './fake-product';
import { insertSite, resetBuilder, until, type SiteFields } from './stack';

// Дорисовка на стенде: вход /draw так, как его зовёт раздача блока 5 (storefront/njs/route.js, drawArgs), — свои места,
// тайм-аут, 404 и 409; дорисованная страница — в списке дорисовок сборки.
let harness: Harness;
let products: FakeProducts;
let server: Server;
let base: string;
let site: SiteFields;
const BUILD = 7;

beforeAll(async () => {
  harness = openHarness();
  products = await startFakeProducts();
  await resetBuilder(harness.db);
  site = await insertSite(harness.db, { name: 'Пледы' });
});
afterAll(async () => {
  await products.close();
  await harness.close();
});
beforeEach(() => {
  render.delayMs = 0;
});
afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())));

async function serve(overrides: Partial<DrawDeps> = {}): Promise<void> {
  const deps: DrawDeps = {
    store: harness.store,
    snapshot: harness.deps.snapshot,
    themes: harness.deps.themes,
    renderHash: RENDER_HASH,
    slots: createSlots(1),
    // Как DRAW_TIMEOUT_MS по умолчанию: на только что поднятом стенде первая дорисовка дольше секунды.
    timeoutMs: 3_000,
    log: harness.deps.log,
    ...overrides,
  };
  server = await startDrawServer(deps, 0);
  base = `http://127.0.0.1:${portOf(server)}`;
}

function draw(path: string, version = { render: RENDER_HASH, theme: 'nova@0.0.1' }): Promise<Response> {
  const query = new URLSearchParams({ shop: site.id, build: String(BUILD), path, ...version });
  return fetch(`${base}/draw?${query.toString()}`);
}

describe('дорисовка одной страницы', () => {
  it('страница есть у темы — 200, отпечаток в X-Merfy-Hash, строка в списке дорисовок сборки', async () => {
    await serve();
    const response = await draw('/');
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain('<h1>Пледы</h1>');
    const hash = createHash('sha256').update(body).digest('hex');
    expect(response.headers.get('x-merfy-hash')).toBe(hash);
    const list = await readObject(harness.store, drawnKey(site.id, BUILD), parseDrawnList);
    expect(list?.value.rows['/']).toMatchObject({ h: hash, t: 'text/html; charset=utf-8' });
  });

  it('такой страницы у темы нет — 404; запрос не по формату — 400; здоровье — 200', async () => {
    await serve();
    expect((await draw('/products/scarf/')).status).toBe(404);
    expect((await fetch(`${base}/draw?shop=x`)).status).toBe(400);
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });

  it('живая сборка другой версии — 409: рисовать чужой версией нельзя', async () => {
    await serve();
    expect((await draw('/', { render: `sha256:${'f'.repeat(64)}`, theme: 'nova@0.0.1' })).status).toBe(409);
    expect((await draw('/', { render: RENDER_HASH, theme: 'nova@9.9.9' })).status).toBe(409);
  });

  it('не успели за тайм-аут — 503; место занято, пока работа не кончилась, — второму 503 сразу', async () => {
    await serve({ timeoutMs: 300 });
    render.hangOnce = true;
    const started = Date.now();
    const slow = await draw('/');
    expect(slow.status).toBe(503);
    expect(Date.now() - started).toBeLessThan(1_000);
    const busy = await draw('/');
    expect([busy.status, await busy.text()]).toEqual([503, 'мест дорисовки нет']);
  });
});

describe('места дорисовки — не места сборок', () => {
  it('единственное место сборки занято — дорисовка всё равно отвечает страницей', async () => {
    await serve({ timeoutMs: 3_000 });
    const builder = openHarness();
    builder.deps.enqueue = enqueueVia(builder.broker, builder.deps.log);
    const runtime: Runtime = await startRuntime(builder.deps);
    const other = await insertSite(builder.db);
    render.delayMs = 1_500;
    await builder.broker.publishEvent({
      type: 'shop-name-change',
      siteId: other.id,
      eventAt: new Date().toISOString(),
      source: 'test',
    });
    await until(() => Promise.resolve(logged(builder.lines, 'build-start').length === 1));
    render.delayMs = 0;
    expect((await draw('/')).status).toBe(200);
    expect(logged(builder.lines, 'build-finish')).toHaveLength(0);
    runtime.stop();
    await until(() => Promise.resolve(logged(builder.lines, 'build-finish').length === 1));
    await builder.close();
  });
});

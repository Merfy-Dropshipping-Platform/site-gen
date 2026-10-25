import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sha256 } from '../../src/canonical';
import type { CodeAssets } from '../../src/code';
import type { BuildInputs, CodeSection } from '../../src/inputs';
import { renderShopPage, type RenderedPage } from '../../src/page';
import type { PageRender } from '../../src/sections-render';
import { readShellBuild, type ShellBuild } from '../../src/shell';
import { changedInputs } from '../support';
import { fakeRender, novaTokens } from '../support-theme';

// ctx.ext в настоящем Chromium (блок 9 «Секций и SDK», часть 9в): страница из renderShopPage с настоящим ядром
// (dist/core.js — перед тестом pnpm --filter @merfy/shell build), конфиг с описаниями тестового расширения «Отзывы-тест»
// (test-ext), бандл с частью ext. Шлюз — этот же сервер: функции расширения отвечают как extension-fn.controller.ts —
// { success: true, data }.
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const SCRIPT =
  'import{defineSection as d}from"@merfy/shell";export default d({mount(e,c){const x=c.ext["test-ext"];' +
  'c.watch(x.$summary,v=>c.ref("summary")?.text(v===null?"—":String(v.reviews)));' +
  'c.watch(x.$rating("scarf-1"),v=>c.ref("rating")?.text(v===null?"—":String(v.stars)));' +
  'c.watch(x.$rating("scarf-2"),v=>c.ref("rating2")?.text(v===null?"—":String(v.stars)))},' +
  'actions:{async vote(t,c){const r=await c.ext["test-ext"].vote({reviewId:"r-1"});' +
  'c.ref("result")?.text(r.ok?"ok "+c.ext["test-ext"].$summary.get().reviews:r.error.code)}}});';
const TEMPLATE =
  '<p data-ref="summary">…</p><p data-ref="rating">…</p><p data-ref="rating2">…</p>' +
  '<button type="button" data-action="vote">Полезно</button>' +
  '<button type="button" data-action="ext.test-ext.vote" data-review-id="r-2">Полезно 2</button>' +
  '<span data-ref="result"></span>';
const RENDER_MODULE = 'export default "shop:reviews";';
const EXTENSIONS: NonNullable<BuildInputs['code']['extensions']> = {
  'test-ext': {
    stores: { summary: { fn: 'shopSummary' }, rating: { fn: 'productRating', by: 'product' } },
    methods: { vote: { fn: 'voteReview', params: ['review-id'] } },
  },
};
const FN_PATH = '/api/store/extensions/test-ext/fn/';

interface Call {
  fn: string;
  storeId: string | null;
  body: unknown;
}
interface Shop {
  origin: string;
  calls: Call[];
  pages: Map<string, Uint8Array>;
  close: () => Promise<void>;
}

// Ответы функций: summary растёт на каждый вызов теста (3, 4, …) — так видно перечитывание после метода.
const FUNCTIONS: Record<string, (calls: readonly Call[]) => unknown> = {
  shopSummary: (calls) => ({ reviews: 2 + calls.filter((call) => call.fn === 'shopSummary').length }),
  productRating: () => ({ 'scarf-1': { stars: 4.5, count: 12 }, 'scarf-2': null }),
  voteReview: () => ({ votes: 1 }),
};

let browser: Browser;
let shop: Shop;
let inputs: BuildInputs;
let rendered: RenderedPage;

const readBody = (request: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => (body += chunk));
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });

const json = (response: ServerResponse, status: number, body: unknown): void =>
  void response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));

async function answer(request: IncomingMessage, response: ServerResponse, current: Shop): Promise<void> {
  const url = new URL(request.url ?? '/', current.origin);
  const body = request.method === 'POST' ? await readBody(request) : '';
  if (url.pathname === '/a/collect') return void response.writeHead(204).end();
  const reply = url.pathname.startsWith(FN_PATH) ? FUNCTIONS[url.pathname.slice(FN_PATH.length)] : undefined;
  if (reply !== undefined) {
    current.calls.push({
      fn: url.pathname.slice(FN_PATH.length),
      storeId: url.searchParams.get('store_id'),
      body: JSON.parse(body),
    });
    return json(response, 200, { success: true, data: reply(current.calls) });
  }
  const file = current.pages.get(url.pathname);
  if (file === undefined) return void response.writeHead(404).end();
  const type = url.pathname.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8';
  response.writeHead(200, { 'content-type': type }).end(file);
}

async function startShop(): Promise<Shop> {
  const current: Shop = { origin: '', calls: [], pages: new Map(), close: () => Promise.resolve() };
  const server = createServer((request, response) => {
    answer(request, response, current).catch(() => response.writeHead(500).end());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  current.origin = `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`;
  current.close = () =>
    new Promise((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  return current;
}

async function renderHome(core: ShellBuild, origin: string): Promise<RenderedPage> {
  const section: CodeSection = {
    name: 'shop:reviews',
    kind: 'section',
    hash: sha256(`shop:reviews${SCRIPT}`),
    render: sha256(RENDER_MODULE),
    script: sha256(SCRIPT),
    // script_meta строки реестра, как его пишет приём (Р9в-20): модуль ctx.ext['test-ext'], часть ext в бандле.
    meta: { uses: ['ext:test-ext'], parts: ['ext'], classes: [] },
  };
  inputs = changedInputs((changed) => {
    changed.shell = { version: core.version, hash: core.hash, parts: core.parts };
    changed.env = { apiUrl: `${origin}/api`, analyticsUrl: `${origin}/a` };
    changed.code = {
      sections: [section],
      pages: { home: [{ id: 'reviews-1', section: 'shop:reviews', settings: {} }] },
      globals: [],
      extensions: EXTENSIONS,
    };
  });
  const renders = new Map([[sha256(RENDER_MODULE), RENDER_MODULE]]);
  const assets: CodeAssets = { shell: core, modules: new Map([[sha256(SCRIPT), Buffer.from(SCRIPT)]]), renders };
  const render = (): Promise<string> => Promise.resolve(TEMPLATE);
  const page: PageRender = { sections: { modules: renders, render }, mode: 'live', code: assets };
  return renderShopPage(inputs, '/', { tokens: novaTokens, render: fakeRender }, page);
}

async function openHome(): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) errors.push(message.text());
  });
  await page.goto(`${shop.origin}/`);
  await page.waitForFunction(() => document.querySelector('[data-ref="rating"]')?.textContent === '4.5');
  return { page, errors };
}

const callsTo = (fn: string): Call[] => shop.calls.filter((call) => call.fn === fn);

beforeAll(async () => {
  shop = await startShop();
  rendered = await renderHome(await readShellBuild(ROOT), shop.origin);
  shop.pages.set('/', rendered.file.content);
  if (rendered.bundle !== undefined) shop.pages.set(`/${rendered.bundle.path}`, rendered.bundle.content);
  browser = await chromium.launch();
});

beforeEach(() => {
  shop.calls.length = 0;
});

afterAll(async () => {
  await browser?.close();
  await shop?.close();
});

describe('ctx.ext в Chromium', () => {
  it('конфиг страницы — описания test-ext; бандл с частью ext', () => {
    const html = new TextDecoder().decode(rendered.file.content);
    const tag = /<script type="application\/json" id="merfy-config">(.*?)<\/script>/s.exec(html)?.[1] ?? '{}';
    const config: unknown = JSON.parse(tag);
    expect(typeof config === 'object' && config !== null ? Reflect.get(config, 'extensions') : null).toEqual(
      EXTENSIONS,
    );
    expect(rendered.bundle?.path).toMatch(/^_merfy\/b\/[0-9a-f]{64}\.js$/);
  });

  it('сторы: один вызов на товары страницы, store_id магазина; значения в секции; консоль пустая', async () => {
    const { page, errors } = await openHome();
    expect(await page.textContent('[data-ref="summary"]')).toBe('3');
    expect(await page.textContent('[data-ref="rating2"]')).toBe('—');
    expect(callsTo('productRating')).toEqual([
      { fn: 'productRating', storeId: inputs.site.id, body: { productIds: ['scarf-1', 'scarf-2'] } },
    ]);
    expect(callsTo('shopSummary').map((call) => call.storeId)).toEqual([inputs.site.id]);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('метод из скрипта: ответ ok, стор расширения перечитан до ответа', async () => {
    const { page } = await openHome();
    await page.click('[data-action="vote"]');
    await page.waitForFunction(() => document.querySelector('[data-ref="result"]')?.textContent !== '');
    expect(await page.textContent('[data-ref="result"]')).toBe('ok 4');
    expect(callsTo('voteReview').map((call) => call.body)).toEqual([{ reviewId: 'r-1' }]);
    await page.close();
  });

  it('data-action="ext.test-ext.vote": аргументы из data-review-id', async () => {
    const { page, errors } = await openHome();
    await page.click('[data-action="ext.test-ext.vote"]');
    await expect.poll(() => callsTo('voteReview').map((call) => call.body)).toEqual([{ reviewId: 'r-2' }]);
    expect(errors).toEqual([]);
    await page.close();
  });
});

import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildShell } from '../../build/build';

// Модуль аналитики в настоящем Chromium (design.md блока 11, раздел 5): страница магазина с ядром @merfy/shell и
// глобальным скриптом platform:analytics. Сборщик аналитики — этот же сервер (POST /a/collect → 204), счётчик Метрики —
// подмена Playwright, остальное наружу обрывается: в сеть ничего не уходит. Chromium под Playwright — робот
// (navigator.webdriver), поэтому traffic = bot.
const PACKAGE_DIR = fileURLToPath(new URL('../..', import.meta.url));
const PAGE_FILE = fileURLToPath(new URL('../../fixtures/browser/analytics/index.html', import.meta.url));
const MODULE_ENTRY = fileURLToPath(new URL('../../sections/analytics/script.ts', import.meta.url));
const DIST_DIR = fileURLToPath(new URL('../../dist-test/analytics', import.meta.url));
const SHOP = '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70';
const CONSENT_KEY = 'merfy:cookie-consent:v1';
const VISIT_KEY = 'merfy:analytics:visit';
const METRIKA = 'https://mc.yandex.ru/metrika/tag.js';
const COLLECT_PATH = '/a/collect';
const SHELL_PREFIX = '/_merfy/shell/';
const BATCH_WAIT_MS = 15_000;
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8' } as const;

interface Batch {
  shop_id: string;
  events: Record<string, string>[];
}

interface AnalyticsServer {
  origin: string;
  batches: unknown[];
  close: () => Promise<void>;
}

interface Visit {
  context: BrowserContext;
  page: Page;
  // Запросы к mc.yandex.ru — счётчик Метрики мерчанта.
  counters: string[];
  // Любые другие запросы наружу — тест ждёт пустой список.
  outside: string[];
}

let browser: Browser;
let server: AnalyticsServer;

const isBatch = (value: unknown): value is Batch =>
  typeof value === 'object' && value !== null && Array.isArray(Reflect.get(value, 'events'));
const collected = (): Record<string, string>[] => server.batches.filter(isBatch).flatMap((batch) => batch.events);

const readBody = (request: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => (body += chunk));
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });

// Файлы страницы: страница с адресом сервера, модуль аналитики, файлы сборки ядра; остальное — 404.
async function fileFor(pathname: string, page: string, moduleCode: string): Promise<[string, string | Buffer] | null> {
  if (pathname === '/catalog') return [TYPES.html, page];
  if (pathname === '/m/analytics.js') return [TYPES.js, moduleCode];
  if (!pathname.startsWith(SHELL_PREFIX)) return null;
  return [TYPES.js, await readFile(join(DIST_DIR, 'shell', pathname.slice(SHELL_PREFIX.length)))];
}

async function startServer(moduleCode: string): Promise<AnalyticsServer> {
  const template = await readFile(PAGE_FILE, 'utf8');
  const batches: unknown[] = [];
  let origin = '';
  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const url = new URL(request.url ?? '/', origin);
    if (request.method === 'POST' && url.pathname === COLLECT_PATH) {
      batches.push(JSON.parse(await readBody(request)));
      return void response.writeHead(204).end();
    }
    const file = await fileFor(url.pathname, template.replaceAll('__ORIGIN__', origin), moduleCode);
    if (file === null) return void response.writeHead(404).end();
    response.writeHead(200, { 'content-type': file[0], 'cache-control': 'no-store' }).end(file[1]);
  };
  const server = createServer((request, response) => {
    handle(request, response).catch(() => response.writeHead(404).end());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  origin = `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`;
  const close = (): Promise<void> =>
    new Promise((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  return { origin, batches, close };
}

// Покупатель открывает каталог: новый контекст браузера (свои cookie и хранилища); ответ баннера — заранее, если задан.
async function openShop(consent: string | null): Promise<Visit> {
  const context = await browser.newContext();
  const counters: string[] = [];
  const outside: string[] = [];
  await context.route('https://mc.yandex.ru/**', (route) => {
    counters.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
  });
  await context.route(
    (url) => url.origin !== server.origin && url.hostname !== 'mc.yandex.ru',
    (route) => {
      outside.push(route.request().url());
      return route.abort();
    },
  );
  if (consent !== null)
    await context.addInitScript(([key, value]) => localStorage.setItem(key, value), [CONSENT_KEY, consent]);
  const page = await context.newPage();
  server.batches.length = 0;
  await page.goto(`${server.origin}/catalog?utm_source=vk`);
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.ready === 'yes' &&
      document.querySelector('merfy-section[data-section="platform:analytics"][data-merfy-state="mounted"]') !== null,
  );
  return { context, page, counters, outside };
}

const cookieNames = async (visit: Visit): Promise<string[]> =>
  (await visit.context.cookies()).map((cookie) => cookie.name);

beforeAll(async () => {
  await buildShell({
    packageDir: PACKAGE_DIR,
    outDir: DIST_DIR,
    core: ['auth', 'cart', 'favorites'],
    version: '0.0.0-test',
  });
  const bundled = await build({
    entryPoints: [MODULE_ENTRY],
    outfile: 'analytics.js',
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    write: false,
    external: ['@merfy/shell'],
    logLevel: 'silent',
  });
  server = await startServer(bundled.outputFiles.map((file) => file.text).join(''));
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

describe('модуль аналитики в Chromium', () => {
  it('до ответа на баннер: визит и просмотр пачкой через 5 с; номер визита — и посетитель; cookie и счётчиков нет', async () => {
    const visit = await openShop(null);
    await expect.poll(() => collected().length, { timeout: BATCH_WAIT_MS }).toBe(2);
    const events = collected();
    expect(events.map((event) => [event.type, event.page_url, event.utm_source, event.traffic])).toEqual([
      ['session_start', '/catalog', 'vk', 'bot'],
      ['page_view', '/catalog', 'vk', 'bot'],
    ]);
    const visitId = events[0]?.session_id;
    expect(events.every((event) => event.session_id === visitId && event.visitor_id === visitId)).toBe(true);
    expect(server.batches.filter(isBatch).map((batch) => batch.shop_id)).toEqual([SHOP]);
    expect(await cookieNames(visit)).toEqual([]);
    const stored = await visit.page.evaluate((key) => sessionStorage.getItem(key), VISIT_KEY);
    expect(stored?.split('|')[0]).toBe(visitId);
    expect([visit.counters, visit.outside]).toEqual([[], []]);
    await visit.context.close();
  });

  it('принял посреди визита: «в корзину» с тем же номером, метки на год и визит, счётчик Метрики загружен', async () => {
    const visit = await openShop(null);
    await expect.poll(() => collected().length, { timeout: BATCH_WAIT_MS }).toBe(2);
    const visitId = collected()[0]?.session_id;
    await visit.page.evaluate((key) => localStorage.setItem(key, new Date().toISOString()), CONSENT_KEY);
    await visit.page.click('[data-buy]');
    await expect
      .poll(() => collected().map((event) => event.type), { timeout: BATCH_WAIT_MS })
      .toContain('add_to_cart');
    const added = collected().find((event) => event.type === 'add_to_cart');
    expect([added?.session_id, added?.visitor_id, added?.product_id, added?.product_price]).toEqual([
      visitId,
      visitId,
      'scarf-1',
      undefined,
    ]);
    const cookies = Object.fromEntries((await visit.context.cookies()).map((cookie) => [cookie.name, cookie.value]));
    expect([cookies._mfy_vid, cookies._mfy_sid]).toEqual([visitId, visitId]);
    expect(visit.counters).toEqual([METRIKA]);
    expect(visit.outside).toEqual([]);
    await visit.context.close();
  });

  it('отклонил: за 5 с с лишним ничего не ушло — ни событий, ни cookie, ни счётчиков', async () => {
    const visit = await openShop(`declined:${new Date().toISOString()}`);
    await visit.page.click('[data-buy]');
    await visit.page.waitForFunction((ms) => performance.now() > ms, 5_500);
    expect(server.batches).toEqual([]);
    expect(await cookieNames(visit)).toEqual([]);
    expect([visit.counters, visit.outside]).toEqual([[], []]);
    await visit.context.close();
  });
});

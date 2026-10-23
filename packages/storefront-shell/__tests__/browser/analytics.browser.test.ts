import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Часть SDK «аналитика» в настоящем Chromium (design.md блока 11, раздел 5; блок 5 «Секций и SDK», часть 5б): страница
// магазина с бандлом страницы — ядро секций, части auth, cart, favorites и analytics, как его собирает сборка магазина.
// Сборщик аналитики и шлюз корзины — этот же сервер (POST /a/collect → 204; POST /api/store/carts и …/items — ответы
// шлюза), счётчик Метрики — подмена Playwright, остальное наружу обрывается: в сеть ничего не уходит. Chromium под
// Playwright — робот (navigator.webdriver), поэтому traffic = bot.
const PACKAGE_DIR = fileURLToPath(new URL('../..', import.meta.url));
const PAGE_FILE = fileURLToPath(new URL('../../fixtures/browser/analytics/index.html', import.meta.url));
const CORE_ENTRY = fileURLToPath(new URL('../../src/core/index.ts', import.meta.url));
const SHOP = '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70';
const CONSENT_KEY = 'merfy:cookie-consent:v1';
const VISIT_KEY = 'merfy:analytics:visit';
const METRIKA = 'https://mc.yandex.ru/metrika/tag.js';
const COLLECT_PATH = '/a/collect';
const BATCH_WAIT_MS = 15_000;
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8' } as const;
// Ответы шлюза корзины (store.controller.ts): новая корзина и строка, которую добавили.
const GATEWAY: Record<string, unknown> = {
  '/api/store/carts': { cart: { id: 'c-1', shopId: SHOP, status: 'cart' } },
  '/api/store/carts/c-1/items': {
    item: {
      id: 'l-1',
      orderId: 'c-1',
      productId: 'scarf-1',
      variantCombinationId: null,
      quantity: 2,
      unitPriceCents: 249000,
      name: 'Шарф',
    },
  },
};

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

// Бандл страницы — ядро секций, четыре части и секция «Купить» без своего кода (только mount), как его собирает сборка
// магазина (часть 5б). Кнопка «В корзину» в ней — действие разметки части cart.
async function pageBundle(): Promise<string> {
  const buy = `{ name: 'shop:buy', kind: 'section', script: '${'a'.repeat(64)}', uses: ['auth', 'cart', 'favorites'], definition: defineSection({ mount() {} }) }`;
  const contents = [
    `import { start, defineSection, auth, cart, favorites, analytics } from ${JSON.stringify(CORE_ENTRY)};`,
    `start({ parts: [auth, cart, favorites, analytics], sections: [${buy}] });`,
  ].join('\n');
  const result = await build({
    stdin: { contents, resolveDir: PACKAGE_DIR, loader: 'js' },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    write: false,
    logLevel: 'silent',
  });
  return result.outputFiles.map((file) => file.text).join('');
}

// POST: сборщик аналитики — пачка в batches; шлюз корзины — ответ из GATEWAY. Остальное — 404.
async function answerPost(request: IncomingMessage, response: ServerResponse, path: string, batches: unknown[]) {
  const body = await readBody(request);
  if (path === COLLECT_PATH) {
    batches.push(JSON.parse(body));
    return void response.writeHead(204).end();
  }
  const reply = GATEWAY[path];
  if (reply === undefined) return void response.writeHead(404).end();
  response.writeHead(201, { 'content-type': 'application/json' }).end(JSON.stringify(reply));
}

async function startServer(bundle: string): Promise<AnalyticsServer> {
  const template = await readFile(PAGE_FILE, 'utf8');
  const batches: unknown[] = [];
  let origin = '';
  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const url = new URL(request.url ?? '/', origin);
    if (request.method === 'POST') return answerPost(request, response, url.pathname, batches);
    const files: Record<string, [string, string]> = {
      '/catalog': [TYPES.html, template.replaceAll('__ORIGIN__', origin)],
      '/b/page.js': [TYPES.js, bundle],
    };
    const file = files[url.pathname];
    if (file === undefined) return void response.writeHead(404).end();
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
    () => document.querySelector('merfy-section[data-section-id="buy-1"][data-merfy-state="mounted"]') !== null,
  );
  return { context, page, counters, outside };
}

const cookieNames = async (visit: Visit): Promise<string[]> =>
  (await visit.context.cookies()).map((cookie) => cookie.name);

beforeAll(async () => {
  server = await startServer(await pageBundle());
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

describe('часть «аналитика» в Chromium', () => {
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

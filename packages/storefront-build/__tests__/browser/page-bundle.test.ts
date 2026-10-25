import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CodeNotice } from '../../src/bundle';
import { sha256 } from '../../src/canonical';
import type { CodeAssets } from '../../src/code';
import type { CodeSection } from '../../src/inputs';
import { renderShopPage, type RenderedPage } from '../../src/page';
import type { PageRender, SectionRenderRequest } from '../../src/sections-render';
import { readShellBuild, type ShellBuild } from '../../src/shell';
import { changedInputs } from '../support';
import { fakeRender, novaTokens } from '../support-theme';

// Бандл страницы в настоящем Chromium (design.md блока 5, раздел 3.10; часть 5б): страница магазина из renderShopPage с
// настоящим ядром секций — dist/core.js пакета @merfy/shell (перед тестом: pnpm --filter @merfy/shell build). Модули
// секций — в том виде, в каком их сохраняет проверка при сохранении; модуль старого вида (part) бандл пропускает.
// Шлюз корзины и сборщик аналитики — этот же сервер.
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const SCRIPTS = {
  badge:
    'import{defineSection as e}from"@merfy/shell";export default e({mount(t,n){n.watch(n.cart.$count,o=>n.ref("count")?.text(o))}});',
  title:
    'import{defineSection as e}from"@merfy/shell";export default e({mount(t,n){n.ref("title")?.text(String(n.settings.title))}});',
  old: 'import{defineSection as e,part as p}from"@merfy/shell";export default e({async mount(){await p("cart")}});',
};
const TEMPLATES: Record<string, string> = {
  'shop:cart-badge': '<a href="/cart">Корзина <span data-ref="count">0</span></a>',
  'shop:title':
    '<h2 data-ref="title">из шаблона</h2><button type="button" data-action="cart.add" data-product-id="scarf-1" data-quantity="2">В корзину</button>',
  'shop:old-badge': '<p>старый значок</p>',
};
// Ответы шлюза корзины (store.controller.ts): новая корзина и строка, которую добавили.
const GATEWAY: Record<string, unknown> = {
  '/api/store/carts': { cart: { id: 'c-1', status: 'cart' } },
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

interface Shop {
  origin: string;
  batches: unknown[];
  pages: Map<string, Uint8Array>;
  close: () => Promise<void>;
}

let browser: Browser;
let shop: Shop;
let rendered: RenderedPage;
const notices: CodeNotice[] = [];

const renderModule = (name: string): string => `export default ${JSON.stringify(name)};`;
const RENDERS = new Map(
  Object.keys(TEMPLATES).map((name): [string, string] => [sha256(renderModule(name)), renderModule(name)]),
);

function section(name: string, script: string): CodeSection {
  const render = sha256(renderModule(name));
  return { name, kind: 'section', hash: sha256(`${name}${script}`), render, script: sha256(script) };
}

const readBody = (request: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => (body += chunk));
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });

async function answer(request: IncomingMessage, response: ServerResponse, current: Shop): Promise<void> {
  const path = new URL(request.url ?? '/', current.origin).pathname;
  const body = request.method === 'POST' ? await readBody(request) : '';
  if (path === '/a/collect') {
    current.batches.push(JSON.parse(body));
    return void response.writeHead(204).end();
  }
  const reply = GATEWAY[path];
  if (reply !== undefined)
    return void response.writeHead(201, { 'content-type': 'application/json' }).end(JSON.stringify(reply));
  const file = current.pages.get(path);
  if (file === undefined) return void response.writeHead(404).end();
  const type = path.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8';
  response.writeHead(200, { 'content-type': type }).end(file);
}

async function startShop(): Promise<Shop> {
  const current: Shop = { origin: '', batches: [], pages: new Map(), close: () => Promise.resolve() };
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

// Главная магазина: «Значок корзины», секция с заголовком из настроек и кнопкой «В корзину», секция старого вида.
async function renderHome(core: ShellBuild, origin: string): Promise<RenderedPage> {
  const sections = [
    section('shop:cart-badge', SCRIPTS.badge),
    section('shop:title', SCRIPTS.title),
    section('shop:old-badge', SCRIPTS.old),
  ];
  const inputs = changedInputs((changed) => {
    changed.shell = { version: core.version, hash: core.hash, parts: core.parts };
    changed.env = { apiUrl: `${origin}/api`, analyticsUrl: `${origin}/a` };
    changed.code = {
      sections,
      pages: {
        home: [
          { id: 'badge-1', section: 'shop:cart-badge', settings: {} },
          { id: 'title-1', section: 'shop:title', settings: { title: 'Подберите шарф к пальто' } },
          { id: 'old-1', section: 'shop:old-badge', settings: {} },
        ],
      },
      globals: [],
    };
  });
  const modules = new Map(
    Object.values(SCRIPTS).map((text): [string, Uint8Array] => [sha256(text), Buffer.from(text)]),
  );
  const assets: CodeAssets = { shell: core, modules, renders: RENDERS };
  const render = (request: SectionRenderRequest): Promise<string> => Promise.resolve(TEMPLATES[request.section] ?? '');
  const page: PageRender = {
    sections: { modules: RENDERS, render },
    mode: 'live',
    code: assets,
    notice: (_pageId, notice) => notices.push(notice),
  };
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
  await page.waitForFunction(
    () => document.querySelector('merfy-section[data-section-id="title-1"][data-merfy-state="mounted"]') !== null,
  );
  return { page, errors };
}

beforeAll(async () => {
  shop = await startShop();
  rendered = await renderHome(await readShellBuild(ROOT), shop.origin);
  shop.pages.set('/', rendered.file.content);
  if (rendered.bundle !== undefined) shop.pages.set(`/${rendered.bundle.path}`, rendered.bundle.content);
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  await shop?.close();
});

describe('бандл страницы в Chromium', () => {
  it('в <head> один <script type="module" src="/_merfy/b/…">; модуль старого вида пропущен с предупреждением', () => {
    const html = new TextDecoder().decode(rendered.file.content);
    expect(rendered.bundle?.path).toMatch(/^_merfy\/b\/[0-9a-f]{64}\.js$/);
    const hex = rendered.bundle?.path.slice('_merfy/b/'.length, -3) ?? '';
    const integrity = `sha256-${Buffer.from(hex, 'hex').toString('base64')}`;
    expect(html.match(/<script type="module"[^>]*>/g)).toEqual([
      `<script type="module" src="/${rendered.bundle?.path}" integrity="${integrity}">`,
    ]);
    expect(html).not.toContain('importmap');
    expect(html).not.toContain('merfy-modules');
    expect(notices.map((notice) => [notice.code, notice.section])).toEqual([
      ['section-script-skipped', 'shop:old-badge'],
    ]);
  });

  it('секции запущены: заголовок — из тега входных данных, «В корзину» — значок 2, ошибок в консоли нет', async () => {
    const { page, errors } = await openHome();
    expect(await page.textContent('[data-ref="title"]')).toBe('Подберите шарф к пальто');
    expect(await page.textContent('[data-ref="count"]')).toBe('0');
    await page.click('[data-action="cart.add"]');
    await page.waitForFunction(() => document.querySelector('[data-ref="count"]')?.textContent === '2');
    expect(await page.getAttribute('merfy-section[data-section-id="old-1"]', 'data-merfy-state')).toBeNull();
    expect(errors).toEqual([]);
    await page.close();
  });

  it('аналитика: просмотр страницы уходит в сборщик (pagehide — пачка сразу)', async () => {
    const { page } = await openHome();
    shop.batches.length = 0;
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await expect.poll(() => JSON.stringify(shop.batches), { timeout: 10_000 }).toContain('"type":"page_view"');
    await page.close();
  });
});

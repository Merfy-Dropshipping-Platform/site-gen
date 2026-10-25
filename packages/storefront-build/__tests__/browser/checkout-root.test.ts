import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import probeLocals from '../../fixtures/probe-locals.json';
import { startRenderer, type Renderer } from '../../src/renderer';
import { buildRendererBundle } from '../../src/theme-build';

// Страница оформления новой темы в настоящем Chromium (выпуск nova 0.7.1, №69): на собранной странице не было
// window.__merfyRoot, ~20 pageerror «window.__merfyRoot is not a function», итог заказа — со спиннером. Страница —
// настоящая серверная сборка nova; бандл и ответы сети — пустые заглушки этого стенда (cartStore не нужен: без него
// сводка рисует пустое состояние, а спиннер уходит).
const NOVA_DIR = fileURLToPath(new URL('../../../../themes/nova/', import.meta.url));
const OUT_DIR = fileURLToPath(new URL('../../../../themes/nova/dist-renderer-browser-test/', import.meta.url));

let browser: Browser;
let renderer: Renderer;
let html: string;
let origin = '';
let server: ReturnType<typeof createServer>;

beforeAll(async () => {
  const bundle = await buildRendererBundle(NOVA_DIR, OUT_DIR);
  renderer = await startRenderer(bundle.serverEntry);
  const checkout = {
    result: false,
    config: { shopId: '3a9626f7-390d-4a66-bca5-a3b806ca6c1b', apiUrl: '', dadataToken: '' },
    varsCss: '.color-scheme-2 { --color-bg: 255 255 255; }',
    header: {},
    layout: {},
    form: {},
    summary: {},
  };
  server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const path = new URL(request.url ?? '/', 'http://stand').pathname;
    if (path === '/checkout') return void response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html);
    if (path.endsWith('.js')) return void response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }).end('');
    if (path.endsWith('.css') || path.endsWith('.png') || path === '/favicon.ico')
      return void response.writeHead(204).end();
    return void response.writeHead(200, { 'content-type': 'application/json' }).end('{}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  origin = `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`;
  html = await renderer.render('/checkout', {
    ...probeLocals,
    checkout: { ...checkout, config: { ...checkout.config, apiUrl: `${origin}/api` } },
  });
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
  await renderer.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('страница оформления nova в браузере', () => {
  it('без pageerror; итог заказа нарисован — спиннер ушёл, показано пустое состояние', async () => {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.location().url.includes('favicon')) errors.push(message.text());
    });
    await page.goto(`${origin}/checkout`);
    await page.waitForFunction(() => {
      const summary = document.querySelector('[data-checkout-summary]');
      const loading = summary?.querySelector('[data-checkout-loading]');
      return summary !== null && loading instanceof Element && loading.getAttribute('hidden') !== null;
    });
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => ('__merfyRoot' in window ? typeof window.__merfyRoot : 'undefined'))).toBe('function');
    await page.close();
  });
});

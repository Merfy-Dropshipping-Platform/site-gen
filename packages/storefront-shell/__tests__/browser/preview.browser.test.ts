import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildShell } from '../../build/build';
import { startFixtureServer, type FixtureServer } from './server';

// Правка в превью в настоящем Chromium (design.md блока 7, С7-22 В): страница конструктора с рамкой превью, сообщения —
// postMessage между окнами, модули — настоящие ES-модули по import map. Сервер — тот же, что у теста ядра (задача 4):
// /preview/… — фикстуры fixtures/browser/preview, /m/cart-badge.js — значок корзины задачи 4, /m/down.js — всегда 503.
// Ядро собирается в свою папку dist-test/preview: тест задачи 4 чистит dist-test/browser.
const PACKAGE_DIR = fileURLToPath(new URL('../..', import.meta.url));
const FIXTURES_DIR = fileURLToPath(new URL('../../fixtures/browser', import.meta.url));
const DIST_DIR = fileURLToPath(new URL('../../dist-test/preview', import.meta.url));
const NAME = 'shop:color-match';
const HTML = '<button type="button" data-pick>Подобрать</button><p data-label></p>';

let browser: Browser;
let server: FixtureServer;

beforeAll(async () => {
  await rm(DIST_DIR, { recursive: true, force: true });
  const version = '0.0.0-test';
  await buildShell({
    packageDir: PACKAGE_DIR,
    outDir: join(DIST_DIR, 'full'),
    core: ['auth', 'cart', 'favorites'],
    version,
  });
  server = await startFixtureServer(FIXTURES_DIR, DIST_DIR);
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

const frame = (page: Page) => page.frameLocator('#preview');
const colorMatch = (page: Page) => frame(page).locator(`merfy-section[data-section="${NAME}"]`);
const mounted = (page: Page) => frame(page).locator('merfy-section[data-merfy-state="mounted"]');

// Страница конструктора: документ рамки загрузился один раз, обе секции в нём живые.
async function openHost(): Promise<Page> {
  const page = await browser.newPage();
  server.requests.length = 0;
  await page.goto(`${server.origin}/preview/host.html`);
  await page.waitForSelector('#preview[data-loads="1"]', { state: 'attached' });
  await expect.poll(() => mounted(page).count()).toBe(2);
  return page;
}

// Сообщение конструктора: postMessage из окна страницы в окно рамки.
const send = (page: Page, src: string): Promise<void> =>
  page.evaluate((data) => document.querySelector('iframe')?.contentWindow?.postMessage(data, '*'), {
    type: 'update-section',
    name: NAME,
    html: HTML,
    src,
  });

// Ответы ядра — строки JSON в <pre id="answers"> страницы конструктора.
async function answers(page: Page): Promise<unknown[]> {
  const text = (await page.locator('#answers').textContent()) ?? '';
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line): unknown => JSON.parse(line));
}

const answer = (outcome: string, message: unknown = null) => ({
  type: 'section-updated',
  name: NAME,
  outcome,
  message,
});

describe('правка в превью в Chromium', () => {
  it('новая версия — с состоянием старой; упавшая — «не ожила», значок корзины живой', async () => {
    const page = await openHost();
    const label = colorMatch(page).locator('[data-label]');
    await colorMatch(page).locator('[data-pick]').click();
    await colorMatch(page).locator('[data-pick]').click();
    await expect.poll(() => label.textContent()).toBe('v1: 2');
    await send(page, '/preview/m/color-match-v2.js');
    await expect.poll(() => answers(page)).toEqual([answer('kept-state')]);
    expect(await label.textContent()).toBe('v2: 2');
    await colorMatch(page).locator('[data-pick]').click();
    await expect.poll(() => label.textContent()).toBe('v2: 3');
    await send(page, '/preview/m/color-match-v3.js');
    await expect
      .poll(() => answers(page))
      .toEqual([answer('kept-state'), answer('failed', 'v3 сломалась при запуске')]);
    expect(await colorMatch(page).getAttribute('data-merfy-state')).toBe('failed');
    expect(await colorMatch(page).getAttribute('inert')).toBe('');
    const badge = frame(page).locator('merfy-section[data-section="platform:cart-badge"]');
    expect(await badge.getAttribute('data-merfy-state')).toBe('mounted');
    expect(server.requests.filter((path) => path.startsWith('/preview/m/color-match-v2.js'))).toEqual([
      '/preview/m/color-match-v2.js',
    ]);
    await page.close();
  });

  it('файл новой версии не отдаётся — reloaded: рамка перезагрузилась, секции снова живые', async () => {
    const page = await openHost();
    await send(page, '/m/down.js');
    await expect.poll(() => answers(page)).toEqual([answer('reloaded', expect.any(String))]);
    await page.waitForSelector('#preview[data-loads="2"]', { state: 'attached' });
    await expect.poll(() => mounted(page).count()).toBe(2);
    expect(server.requests.filter((path) => path.startsWith('/preview/index.html'))).toHaveLength(2);
    expect(server.requests.filter((path) => path.startsWith('/m/down.js'))).toEqual([
      '/m/down.js',
      '/m/down.js?merfy-retry=1',
    ]);
    await page.close();
  });
});

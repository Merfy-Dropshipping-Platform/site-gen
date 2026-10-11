import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildShell } from '../../build/build';
import { startFixtureServer, type FixtureServer } from './server';

// Ядро в настоящем Chromium (design.md блока 7, раздел 5, шаги 16–18, 26, 30): две сборки ядра — full (все части в
// ядре) и lean (в ядре только вход: корзина и избранное — отдельными файлами).
const PACKAGE_DIR = fileURLToPath(new URL('../..', import.meta.url));
const FIXTURES_DIR = fileURLToPath(new URL('../../fixtures/browser', import.meta.url));
const DIST_DIR = fileURLToPath(new URL('../../dist-test/browser', import.meta.url));
const LIVE_SECTIONS = 7;

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
  await buildShell({ packageDir: PACKAGE_DIR, outDir: join(DIST_DIR, 'lean'), core: ['auth'], version });
  server = await startFixtureServer(FIXTURES_DIR, DIST_DIR);
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

// Открыть страницу и дождаться, пока все модули загружены: секции живые или «не ожила», глобальный скрипт отработал.
async function openPage(shell: 'full' | 'lean') {
  const page = await browser.newPage();
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  server.requests.length = 0;
  await page.goto(`${server.origin}/?shell=${shell}`);
  await page.waitForFunction(
    (count) =>
      document.documentElement.dataset.geo === 'ok' &&
      document.querySelectorAll('merfy-section[data-merfy-state]').length === count,
    LIVE_SECTIONS,
  );
  return { page, consoleErrors };
}

const states = (page: Page): Promise<Record<string, string | null>> =>
  page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('merfy-section')].map((element): [string, string | null] => [
        element.getAttribute('data-section') ?? '',
        element.getAttribute('data-merfy-state'),
      ]),
    ),
  );

const shellErrors = (consoleErrors: readonly string[]): string[] =>
  consoleErrors.filter((text) => text.startsWith('Секция '));

describe('ядро в Chromium', () => {
  it('четыре автора на странице: живые, «не ожила», без скрипта; повтор загрузки; ядро — один запрос', async () => {
    const { page, consoleErrors } = await openPage('full');
    expect(await states(page)).toEqual({
      'platform:cart-badge': 'mounted',
      'nova:scarf-colors': 'mounted',
      'shop:broken': 'failed',
      'reviews:list': 'mounted',
      'shop:clicky': 'mounted',
      'shop:down': 'failed',
      'shop:static': null,
      'geo:locate': 'mounted',
    });
    expect(await page.locator('merfy-section[data-section="shop:broken"]').getAttribute('inert')).toBe('');
    await expect.poll(() => shellErrors(consoleErrors).length).toBe(2);
    expect(shellErrors(consoleErrors)).toContain('Секция shop:broken не ожила (mount): сломалась при запуске');
    expect(shellErrors(consoleErrors).some((text) => text.startsWith('Секция shop:down не ожила (load): '))).toBe(true);
    expect(server.requests.filter((path) => path.startsWith('/_merfy/shell/'))).toEqual([
      '/_merfy/shell/full/shell.js',
    ]);
    expect(server.requests.filter((path) => path.startsWith('/m/flaky.js'))).toEqual([
      '/m/flaky.js',
      '/m/flaky.js?merfy-retry=1',
    ]);
    expect(server.requests.filter((path) => path.startsWith('/m/down.js'))).toEqual([
      '/m/down.js',
      '/m/down.js?merfy-retry=1',
    ]);
    await page.close();
  });

  it('«Купить такой же» в отзывах расширения — значок корзины платформы +1 каждый раз: копия SDK одна', async () => {
    const { page } = await openPage('full');
    const count = page.locator('merfy-section[data-section="platform:cart-badge"] [data-count]');
    await page.click('[data-buy]');
    await expect.poll(() => count.textContent()).toBe('1');
    await page.click('[data-buy]');
    await expect.poll(() => count.textContent()).toBe('2');
    await page.click('[data-color]');
    expect(await page.locator('[data-picked]').textContent()).toBe('Выбран: чёрный');
    await page.close();
  });

  it('ошибка в обработчике клика — секция «не ожила» (runtime), соседи живые', async () => {
    const { page, consoleErrors } = await openPage('full');
    await page.click('[data-boom]');
    await page.waitForSelector('merfy-section[data-section="shop:clicky"][data-merfy-state="failed"]', {
      state: 'attached',
    });
    const after = await states(page);
    expect([after['shop:clicky'], after['reviews:list'], after['platform:cart-badge']]).toEqual([
      'failed',
      'mounted',
      'mounted',
    ]);
    await expect
      .poll(() => shellErrors(consoleErrors))
      .toContain('Секция shop:clicky не ожила (runtime): клик сломался');
    await page.close();
  });

  it('состав ядра — список: корзина вне ядра качается своим файлом при первом part(), значок работает', async () => {
    const { page } = await openPage('lean');
    await page.click('[data-buy]');
    await expect
      .poll(() => page.locator('merfy-section[data-section="platform:cart-badge"] [data-count]').textContent())
      .toBe('1');
    const shellFiles = server.requests.filter((path) => path.startsWith('/_merfy/shell/lean/'));
    expect(shellFiles.filter((path) => path === '/_merfy/shell/lean/shell.js')).toHaveLength(1);
    expect(shellFiles.some((path) => /^\/_merfy\/shell\/lean\/part-[A-Z0-9]{8}\.js$/.test(path))).toBe(true);
    await page.close();
  });
});

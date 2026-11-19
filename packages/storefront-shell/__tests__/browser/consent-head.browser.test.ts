import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONSENT_KEY } from '../../src/core/analytics/consent';
import { CONSENT_CSS, CONSENT_HEAD_SCRIPT } from '../../src/core/behaviors/consent-head';

// Баннер cookie с первого кадра (19.11) в настоящем Chromium. Страница — как у магазина: в <head> скрипт ответа о cookie
// и стиль платформы, правило [hidden] базы страницы (preflight, !important), бандл — ядро, часть consent и скрипт секции
// sections баннера из библиотеки (fixtures/shop/cookie-banner/script.ts). Бандл можно придержать: что видит покупатель,
// пока он грузится, — главный вопрос.
const PACKAGE_DIR = fileURLToPath(new URL('../..', import.meta.url));
const CORE_ENTRY = fileURLToPath(new URL('../../src/core/index.ts', import.meta.url));
const BANNER_SCRIPT = fileURLToPath(
  new URL('../../../storefront-sections/fixtures/shop/cookie-banner/script.ts', import.meta.url),
);
const CONFIG = {
  v: 1,
  mode: 'live',
  shop: { id: '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70', name: 'Шарфы', url: null },
  currency: 'RUB',
  locale: 'ru-RU',
  api: { url: 'http://127.0.0.1:9/api' },
  theme: { id: 'nova', version: '0.0.4' },
  page: { id: 'home', path: '/' },
  analytics: null,
};
const PAGE_CSS = [
  "[hidden]:where(:not([hidden='until-found'])){display:none!important}",
  '.fixed{position:fixed}.bottom-0{bottom:0}.inset-x-0{left:0;right:0}',
  CONSENT_CSS,
].join('');
// Разметка секции как у шаблона баннера: корень скрыт, пока ядро не покажет его.
const BANNER =
  '<section data-ref="banner" hidden aria-label="Согласие на cookie" class="fixed inset-x-0 bottom-0">' +
  '<p>Мы используем файлы cookie, чтобы сайт работал корректно.</p>' +
  '<button type="button" data-action="consent.accept">Принять</button>' +
  '<button type="button" data-action="consent.decline">Отклонить</button></section>';

interface Shop {
  origin: string;
  close: () => Promise<void>;
}

let browser: Browser;
let shop: Shop;

async function pageBundle(): Promise<string> {
  const banner = `{ name: 'shop:cookie-banner', kind: 'section', script: '${'b'.repeat(64)}', uses: ['consent'], definition: banner }`;
  const contents = [
    `import { start, consent } from ${JSON.stringify(CORE_ENTRY)};`,
    `import banner from ${JSON.stringify(BANNER_SCRIPT)};`,
    `start({ parts: [consent], sections: [${banner}] });`,
  ].join('\n');
  const result = await build({
    stdin: { contents, resolveDir: PACKAGE_DIR, loader: 'js' },
    alias: { '@merfy/shell': CORE_ENTRY },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
    logLevel: 'silent',
  });
  return result.outputFiles.map((file) => file.text).join('');
}

const pageHtml = (): string =>
  [
    `<!doctype html><html lang="ru"><head><meta charset="utf-8"><script>${CONSENT_HEAD_SCRIPT}</script>`,
    `<style>${PAGE_CSS}</style>`,
    `<script type="application/json" id="merfy-config">${JSON.stringify(CONFIG)}</script>`,
    '<script type="module" src="/b/page.js"></script></head><body><p>Страница магазина</p>',
    `<merfy-section data-section="shop:cookie-banner" data-section-id="banner-1" data-role="cookie-banner">${BANNER}</merfy-section>`,
    '</body></html>',
  ].join('');

async function startShop(): Promise<Shop> {
  const bundle = await pageBundle();
  const handle = (request: IncomingMessage, response: ServerResponse): void => {
    const path = new URL(request.url ?? '/', 'http://shop.local').pathname;
    const files: Record<string, [string, string]> = {
      '/': ['text/html; charset=utf-8', pageHtml()],
      '/b/page.js': ['text/javascript; charset=utf-8', bundle],
    };
    const file = files[path];
    if (file === undefined) return void response.writeHead(404).end();
    response.writeHead(200, { 'content-type': file[0], 'cache-control': 'no-store' }).end(file[1]);
  };
  const server = createServer(handle);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  const close = (): Promise<void> =>
    new Promise((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  return { origin: `http://127.0.0.1:${port}`, close };
}

beforeAll(async () => {
  shop = await startShop();
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  await shop?.close();
});

const banner = (page: Page) => page.locator('[data-ref="banner"]');
const htmlClass = async (page: Page): Promise<string> => (await page.locator('html').getAttribute('class')) ?? '';

// Страница, у которой бандл придержан: до release() покупатель видит только HTML, стили и скрипт в <head>.
async function openHeld(stored: string | null, storageBroken = false) {
  const context = await browser.newContext();
  if (stored !== null)
    await context.addInitScript(`localStorage.setItem(${JSON.stringify(CONSENT_KEY)}, ${JSON.stringify(stored)})`);
  if (storageBroken)
    await context.addInitScript(
      "Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } })",
    );
  const page = await context.newPage();
  let release = (): void => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/b/page.js', async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(`${shop.origin}/`, { waitUntil: 'commit' });
  await banner(page).waitFor({ state: 'attached' });
  return { page, release, close: () => context.close() };
}

describe('баннер cookie с первого кадра · Chromium', () => {
  it('новый посетитель: баннер виден, пока бандл ещё грузится; после запуска остаётся, класс на <html> снят', async () => {
    const { page, release, close } = await openHeld(null);
    expect(await banner(page).isVisible()).toBe(true);
    expect(await htmlClass(page)).toBe('mfy-consent-new');
    release();
    await page.waitForFunction('!document.documentElement.classList.contains("mfy-consent-new")');
    expect(await banner(page).isVisible()).toBe(true);
    await close();
  });

  it('«Принять»: баннер скрыт, ответ записан, после перезагрузки баннера нет с первого кадра', async () => {
    const { page, release, close } = await openHeld(null);
    release();
    await page.waitForFunction('!document.documentElement.classList.contains("mfy-consent-new")');
    await page.getByRole('button', { name: 'Принять' }).click();
    expect(await banner(page).isVisible()).toBe(false);
    expect(await page.evaluate(`localStorage.getItem(${JSON.stringify(CONSENT_KEY)}) !== null`)).toBe(true);
    await page.unroute('**/b/page.js');
    const second = await page.context().newPage();
    let release2 = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release2 = resolve;
    });
    await second.route('**/b/page.js', async (route) => {
      await held;
      await route.continue();
    });
    await second.goto(`${shop.origin}/`, { waitUntil: 'commit' });
    await banner(second).waitFor({ state: 'attached' });
    expect(await banner(second).isVisible()).toBe(false);
    expect(await htmlClass(second)).toBe('');
    release2();
    await close();
  });

  it.each([
    ['принял', '2026-11-19T10:00:00.000Z'],
    ['отклонил', 'declined:2026-11-19T10:00:00.000Z'],
  ])('покупатель %s: баннера нет ни до бандла, ни после, класса нет', async (_answer, stored) => {
    const { page, release, close } = await openHeld(stored);
    expect(await banner(page).isVisible()).toBe(false);
    expect(await htmlClass(page)).toBe('');
    release();
    await page.waitForFunction(
      'document.querySelector("merfy-section").getAttribute("data-merfy-state") === "mounted"',
    );
    expect(await banner(page).isVisible()).toBe(false);
    await close();
  });

  it('хранилище недоступно (приватный режим): ответа нет — баннер показывается', async () => {
    const { page, release, close } = await openHeld(null, true);
    expect(await banner(page).isVisible()).toBe(true);
    release();
    await page.waitForFunction(
      'document.querySelector("merfy-section").getAttribute("data-merfy-state") === "mounted"',
    );
    expect(await banner(page).isVisible()).toBe(true);
    await close();
  });
});

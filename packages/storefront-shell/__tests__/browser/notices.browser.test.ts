import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// «Уведомления» в настоящем Chromium (блок 9 «Секций и SDK», п. 10; часть 9б). Бандл страницы — ядро секций, часть cart,
// часть-пульт теста (window.__notify отправляет merfy:notice:show так же, как части SDK) и секция
// sections/notices/script.ts; разметка секции — её template.astro как есть. Часы — Playwright clock: 8 с без ожидания.
// Шлюз корзины (api.url — http://127.0.0.1:9/api) подменяет Playwright.
const PACKAGE_DIR = fileURLToPath(new URL('../..', import.meta.url));
const CORE_ENTRY = fileURLToPath(new URL('../../src/core/index.ts', import.meta.url));
const NOTICES_SCRIPT = fileURLToPath(new URL('../../sections/notices/script.ts', import.meta.url));
const NOTICES_TEMPLATE = fileURLToPath(new URL('../../sections/notices/template.astro', import.meta.url));
const API_ROUTE = 'http://127.0.0.1:9/api/**';
const CORS = { 'access-control-allow-origin': '*' };
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8' } as const;
const CONFIG = {
  v: 1,
  mode: 'preview',
  shop: { id: '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70', name: 'Шарфы', url: null },
  currency: 'RUB',
  locale: 'ru-RU',
  api: { url: 'http://127.0.0.1:9/api' },
  theme: { id: 'nova', version: '0.0.4' },
  page: { id: 'home', path: '/' },
  analytics: null,
};
const OUT_OF_STOCK = { success: false, code: 'out_of_stock', message: 'Товара нет в наличии' };
// Стили, от которых зависит, куда попадает указатель: правило [hidden] базы страницы (preflight, @merfy/tokens base.css) и
// классы шаблона «Уведомлений». Остальной CSS тесту не нужен.
const PAGE_CSS = [
  "[hidden]:where(:not([hidden='until-found'])){display:none!important}",
  '.fixed{position:fixed}.inset-x-0{left:0;right:0}.bottom-0{bottom:0}.z-50{z-index:50}',
  '.flex{display:flex}.flex-col{flex-direction:column}.items-center{align-items:center}.p-4{padding:1rem}',
  '.w-full{width:100%}.max-w-md{max-width:28rem}',
  '.pointer-events-none{pointer-events:none}.pointer-events-auto{pointer-events:auto}',
].join('');
// Кнопка страницы в левом нижнем углу — под полосой «Уведомлений», но не под самим уведомлением.
const UNDER =
  '<button type="button" id="under" style="position:fixed;left:0;bottom:0;width:48px;height:48px">Под</button>';

interface Shop {
  origin: string;
  close: () => Promise<void>;
}

let browser: Browser;
let shop: Shop;

async function pageBundle(): Promise<string> {
  const remote =
    "{ name: 'remote', create: (core) => { window.__notify = (detail) => core.emit('merfy:notice:show', detail); return null; } }";
  const notices = `{ name: 'shop:notices', kind: 'section', script: '${'n'.repeat(64)}', uses: [], definition: notices }`;
  const contents = [
    `import { start, cart } from ${JSON.stringify(CORE_ENTRY)};`,
    `import notices from ${JSON.stringify(NOTICES_SCRIPT)};`,
    `start({ parts: [cart, ${remote}], sections: [${notices}] });`,
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

async function pageHtml(): Promise<string> {
  const template = await readFile(NOTICES_TEMPLATE, 'utf8');
  return [
    `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>${PAGE_CSS}</style>`,
    `<script type="application/json" id="merfy-config">${JSON.stringify(CONFIG)}</script>`,
    '<script type="module" src="/b/page.js"></script></head><body>',
    '<merfy-section data-section="shop:buy" data-section-id="buy-1">',
    '<button type="button" data-action="cart.add" data-product-id="p12">В корзину</button></merfy-section>',
    `<merfy-section data-section="shop:notices" data-section-id="notices-1">${template}</merfy-section>`,
    UNDER,
    '</body></html>',
  ].join('');
}

async function startShop(): Promise<Shop> {
  const files: Record<string, [string, string]> = {
    '/': [TYPES.html, await pageHtml()],
    '/b/page.js': [TYPES.js, await pageBundle()],
  };
  const handle = (request: IncomingMessage, response: ServerResponse): void => {
    const file = files[new URL(request.url ?? '/', 'http://shop.local').pathname];
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

// Строка браузера про ответ 400 шлюза — не ошибка кода страницы.
const RESOURCE_FAILED = 'Failed to load resource';

// Страница с поддельными часами (стоят, идут только по runFor); шлюз: новая корзина c-1, добавление — 400 out_of_stock
// (тело шлюза части 9б).
async function openShop() {
  const page = await browser.newPage();
  const errors: string[] = [];
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith(RESOURCE_FAILED)) errors.push(message.text());
    if (message.type() === 'warning') warnings.push(message.text());
  });
  await page.clock.install();
  await page.route(API_ROUTE, (route) =>
    new URL(route.request().url()).pathname === '/api/store/carts'
      ? route.fulfill({ status: 201, headers: CORS, json: { cart: { id: 'c-1' } } })
      : route.fulfill({ status: 400, headers: CORS, json: OUT_OF_STOCK }),
  );
  await page.goto(`${shop.origin}/`);
  await page.waitForFunction('typeof window.__notify === "function"');
  await page.clock.pauseAt(Date.now() + 60_000);
  return { page, errors, warnings };
}

const notify = (page: Page, level: 'error' | 'warning', message: string): Promise<unknown> =>
  page.evaluate(`window.__notify(${JSON.stringify({ level, message })})`);
const list = (page: Page) => page.locator('merfy-section[data-section="shop:notices"] [data-ref="list"]');
const rows = (page: Page) => list(page).locator(':scope > [role]');
const texts = (page: Page): Promise<string[]> => rows(page).locator('[data-ref="text"]').allTextContents();

describe('секция «Уведомления» в Chromium', () => {
  it('ошибка — role="alert", предупреждение — role="status"; без уведомлений список скрыт', async () => {
    const { page, errors } = await openShop();
    expect(await list(page).isHidden()).toBe(true);
    await notify(page, 'error', 'Нет связи с магазином. Проверьте интернет и попробуйте ещё раз');
    await notify(page, 'warning', 'Добавили 2 шт. — больше нет в наличии');
    expect(await list(page).isVisible()).toBe(true);
    expect(await rows(page).evaluateAll((nodes) => nodes.map((node) => node.getAttribute('role')))).toEqual([
      'alert',
      'status',
    ]);
    expect(await texts(page)).toEqual([
      'Нет связи с магазином. Проверьте интернет и попробуйте ещё раз',
      'Добавили 2 шт. — больше нет в наличии',
    ]);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('через 8 с скрывается; список пуст — скрыт', async () => {
    const { page } = await openShop();
    await notify(page, 'error', 'Не получилось. Попробуйте ещё раз через минуту');
    await page.clock.runFor(7999);
    expect(await texts(page)).toHaveLength(1);
    await page.clock.runFor(1);
    expect(await texts(page)).toEqual([]);
    expect(await list(page).isHidden()).toBe(true);
    await page.close();
  });

  it('указатель над списком — не скрывается; ушёл — снова 8 с', async () => {
    const { page } = await openShop();
    await notify(page, 'error', 'Этого товара нет в наличии');
    await rows(page).first().hover();
    await page.clock.runFor(20_000);
    expect(await texts(page)).toEqual(['Этого товара нет в наличии']);
    await page.mouse.move(0, 0);
    await page.clock.runFor(7999);
    expect(await texts(page)).toHaveLength(1);
    await page.clock.runFor(1);
    expect(await texts(page)).toEqual([]);
    await page.close();
  });

  it('фокус на «Закрыть» — не скрывается; фокус ушёл — снова 8 с', async () => {
    const { page } = await openShop();
    await page.mouse.move(0, 0);
    await notify(page, 'warning', 'Добавили 1 шт. — больше нет в наличии');
    await rows(page).first().getByRole('button', { name: 'Закрыть' }).focus();
    await page.clock.runFor(20_000);
    expect(await texts(page)).toHaveLength(1);
    await page.locator('[data-action="cart.add"]').focus();
    await page.clock.runFor(8000);
    expect(await texts(page)).toEqual([]);
    await page.close();
  });

  it('не больше трёх — самое старое уходит; одинаковый текст — одно уведомление, срок заново', async () => {
    const { page } = await openShop();
    await page.mouse.move(0, 0);
    for (const text of ['первое', 'второе', 'третье', 'четвёртое']) await notify(page, 'error', text);
    expect(await texts(page)).toEqual(['второе', 'третье', 'четвёртое']);
    await page.clock.runFor(5000);
    await notify(page, 'error', 'второе');
    expect(await texts(page)).toEqual(['второе', 'третье', 'четвёртое']);
    await page.clock.runFor(3000);
    expect(await texts(page)).toEqual(['второе']);
    await page.clock.runFor(5000);
    expect(await texts(page)).toEqual([]);
    await page.close();
  });

  it('«Закрыть» — уведомление уходит сразу, остальные — на месте', async () => {
    const { page } = await openShop();
    await notify(page, 'error', 'первое');
    await notify(page, 'error', 'второе');
    await rows(page).first().getByRole('button', { name: 'Закрыть' }).click();
    expect(await texts(page)).toEqual(['второе']);
    await page.close();
  });

  it('полоса уведомлений не закрывает страницу: кнопка под ней нажимается, наведение на уведомление держит срок', async () => {
    const { page } = await openShop();
    await page.evaluate("document.getElementById('under').addEventListener('click', () => { window.__under = 1; })");
    await notify(page, 'error', 'Этого товара нет в наличии');
    await page.locator('#under').click({ timeout: 2000 });
    expect(await page.evaluate('window.__under')).toBe(1);
    await rows(page).first().hover();
    await page.clock.runFor(20_000);
    expect(await texts(page)).toEqual(['Этого товара нет в наличии']);
    await page.close();
  });

  it('«В корзину» и 400 out_of_stock — «Этого товара нет в наличии» в секции, консоль без предупреждения', async () => {
    const { page, errors, warnings } = await openShop();
    await page.click('[data-action="cart.add"]');
    await rows(page).first().waitFor();
    expect(await texts(page)).toEqual(['Этого товара нет в наличии']);
    expect(await rows(page).first().getAttribute('role')).toBe('alert');
    expect([errors, warnings]).toEqual([[], []]);
    await page.close();
  });
});

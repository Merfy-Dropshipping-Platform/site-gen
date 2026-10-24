import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, firefox, webkit, type Browser, type BrowserType, type Frame, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildCore } from '../../build/core';
import { startFixtureServer, type FixtureServer } from './server';

// Замена экземпляра в превью (блок 5 «Секций и SDK», часть 5г; design.md блока 5, разделы 3.11 и 8) в настоящих
// браузерах. Рамка — как у превью новой темы (В2-2 Б): sandbox="allow-scripts allow-forms", origin "null", политика
// form-action 'none'. Бандл страницы — строкой в JSON-теге, код версий секции — через blob:. Браузеры — MERFY_BROWSERS
// (по умолчанию chromium): MERFY_BROWSERS=chromium,webkit,firefox pnpm exec vitest run --project browser <этот файл>.
const PACKAGE_DIR = fileURLToPath(new URL('../..', import.meta.url));
const FIXTURES_DIR = fileURLToPath(new URL('../../fixtures/browser/preview', import.meta.url));
const DIST_DIR = fileURLToPath(new URL('../../dist-test/preview-browser', import.meta.url));
const TYPES: Readonly<Record<string, BrowserType>> = { chromium, webkit, firefox };
const BROWSERS = (process.env.MERFY_BROWSERS ?? 'chromium')
  .split(',')
  .map((name) => name.trim())
  .filter((name) => name !== '');
const HASH = { v1: 'a'.repeat(64), v2: 'b'.repeat(64), picky: 'c'.repeat(64), broken: 'd'.repeat(64) };
const SYNTAX_HASH = 'e'.repeat(64);
const CONFIG = {
  v: 1,
  mode: 'preview',
  shop: { id: '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70', name: 'Шарфы', url: 'https://scarves.example' },
  currency: 'RUB',
  locale: 'ru-RU',
  api: { url: 'http://127.0.0.1:9/api' },
  theme: { id: 'nova', version: '0.0.4' },
  page: { id: 'home', path: '/' },
};

interface Script {
  readonly hash: string;
  readonly code: string;
  readonly uses: readonly string[];
}

interface Updated {
  readonly outcome: string;
  readonly message: string;
}

const sectionHtml = (title: string): string =>
  `<merfy-section data-section="shop:scarf" data-section-id="scarf-1"><h2 data-ref="title">${title}</h2>` +
  '<button type="button" data-ref="coat" data-coat="grey" data-action="pick">Серое</button>' +
  '<button type="button" data-ref="coat" data-coat="black" data-action="pick">Чёрное</button>' +
  '<p data-ref="clock"></p><script type="application/json" data-merfy-input>' +
  `${JSON.stringify({ settings: { title }, blocks: [], data: {} })}</script></merfy-section>`;

// Бандл страницы превью — как его соберёт сборщик (план 2): ядро, «Подбор шарфа» v1, preview: watchPreviewReplace.
const pageEntry = (): string =>
  [
    `import { start, watchPreviewReplace } from ${JSON.stringify(join(DIST_DIR, 'core.js'))};`,
    `import scarf from ${JSON.stringify(join(FIXTURES_DIR, 'scarf-v1.js'))};`,
    `start({ parts: [], sections: [{ name: 'shop:scarf', kind: 'section', script: ${JSON.stringify(HASH.v1)}, ` +
      `uses: [], definition: scarf }], preview: watchPreviewReplace });`,
  ].join('\n');

const frameHtml = (bundle: string, preview: string): string =>
  '<!doctype html><html lang="ru"><head><meta charset="utf-8">' +
  `<meta http-equiv="Content-Security-Policy" content="form-action 'none'">` +
  `<script type="application/json" id="merfy-config">${JSON.stringify(CONFIG)}</script></head>` +
  `<body>${sectionHtml('Подберите шарф')}` +
  `<script type="application/json" id="merfy-preview-bundle">${JSON.stringify(bundle).replaceAll('<', '\\u003c')}</script>` +
  `<script>${preview}</script></body></html>`;

// Страница конструктора: рамка превью и копии сообщений section-updated из неё в window.__updates.
const HOST_HTML =
  '<!doctype html><html lang="ru"><head><meta charset="utf-8"></head><body>' +
  '<iframe id="preview" sandbox="allow-scripts allow-forms" src="/frame.html" width="900" height="600"></iframe>' +
  '<script>window.__updates = []; window.addEventListener("message", (event) => {' +
  ' const frame = document.getElementById("preview");' +
  ' if (frame && event.source === frame.contentWindow && event.data && event.data.type === "section-updated")' +
  ' window.__updates.push(event.data); });</script></body></html>';

let server: FixtureServer;
const codes = { v1: '', v2: '', picky: '', broken: '' };

beforeAll(async () => {
  await rm(DIST_DIR, { recursive: true, force: true });
  await buildCore({ packageDir: PACKAGE_DIR, outDir: DIST_DIR, core: [], version: '0.0.0-test' });
  // Скрипт превью — как его соберёт build/preview.ts плана 2: обычный скрипт (IIFE) из src/preview/entry.ts.
  const script = await build({
    entryPoints: [join(PACKAGE_DIR, 'src/preview/entry.ts')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    write: false,
    logLevel: 'silent',
  });
  const bundle = await build({
    stdin: { contents: pageEntry(), resolveDir: PACKAGE_DIR, loader: 'js' },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    write: false,
    logLevel: 'silent',
  });
  const preview = script.outputFiles[0]?.text ?? '';
  await mkdir(DIST_DIR, { recursive: true });
  await writeFile(join(DIST_DIR, 'frame.html'), frameHtml(bundle.outputFiles[0]?.text ?? '', preview));
  await writeFile(join(DIST_DIR, 'index.html'), HOST_HTML);
  codes.v1 = await readFile(join(FIXTURES_DIR, 'scarf-v1.js'), 'utf8');
  codes.v2 = await readFile(join(FIXTURES_DIR, 'scarf-v2.js'), 'utf8');
  codes.picky = await readFile(join(FIXTURES_DIR, 'picky.js'), 'utf8');
  codes.broken = await readFile(join(FIXTURES_DIR, 'broken.js'), 'utf8');
  server = await startFixtureServer(DIST_DIR, DIST_DIR);
});

afterAll(async () => {
  await server?.close();
});

const isUpdated = (value: unknown): value is Updated =>
  typeof value === 'object' &&
  value !== null &&
  typeof Reflect.get(value, 'outcome') === 'string' &&
  typeof Reflect.get(value, 'message') === 'string';

async function updatesOf(page: Page): Promise<Updated[]> {
  const list: unknown = await page.evaluate('window.__updates');
  return Array.isArray(list) ? list.filter(isUpdated) : [];
}

async function frameOf(page: Page): Promise<Frame> {
  const element = await page.waitForSelector('#preview');
  const frame = await element.contentFrame();
  if (frame === null) throw new Error('нет рамки превью');
  return frame;
}

const clock = (frame: Frame): Promise<string | null> => frame.locator('[data-ref="clock"]').textContent();
const frameLoads = (): number => server.requests.filter((path) => path === '/frame.html').length;

// Правка — как её передаст скрипт секций превью (план 2): merfy:preview:update на секции; ответ — section-updated.
async function update(page: Page, frame: Frame, html: string, script: Script): Promise<Updated> {
  const before = (await updatesOf(page)).length;
  const taken = await frame.evaluate(
    ([nextHtml, nextScript]) => {
      const node = document.querySelector('merfy-section[data-section-id="scarf-1"]');
      const detail = { html: nextHtml, script: nextScript, codeOnly: false };
      const event = new CustomEvent('merfy:preview:update', { bubbles: true, cancelable: true, detail });
      return node !== null && !node.dispatchEvent(event);
    },
    [html, script] as const,
  );
  expect(taken).toBe(true);
  await expect.poll(async () => (await updatesOf(page)).length).toBe(before + 1);
  const last = (await updatesOf(page)).at(-1);
  return { outcome: last?.outcome ?? '', message: last?.message ?? '' };
}

describe.each(BROWSERS)('замена экземпляра в превью — %s', (name) => {
  let browser: Browser;

  beforeAll(async () => {
    const type = TYPES[name];
    if (type === undefined) throw new Error(`браузера ${name} нет в Playwright`);
    browser = await type.launch();
  });

  afterAll(async () => {
    await browser?.close();
  });

  it('правка поля, код v2 через blob:, код без старого состояния, сломанный код, код с ошибкой разбора', async () => {
    const page = await browser.newPage();
    await page.goto(`${server.origin}/`);
    const frame = await frameOf(page);
    await frame.locator('merfy-section[data-merfy-state="mounted"]').waitFor();
    expect(await frame.evaluate(() => self.origin)).toBe('null');
    expect(await frame.locator('script[type="module"]').count()).toBe(0);
    await frame.locator('[data-coat="grey"]').click();
    expect(await clock(frame)).toBe('v1 · запусков: 1 · grey');

    const v1 = { hash: HASH.v1, code: codes.v1, uses: [] };
    expect(await update(page, frame, sectionHtml('Новый заголовок'), v1)).toEqual({
      outcome: 'kept-state',
      message: '',
    });
    expect(await frame.locator('[data-ref="title"]').textContent()).toBe('Новый заголовок');
    expect(await clock(frame)).toBe('v1 · запусков: 2 · grey');

    const v2 = { hash: HASH.v2, code: codes.v2, uses: [] };
    expect(await update(page, frame, sectionHtml('Новый заголовок'), v2)).toEqual({
      outcome: 'kept-state',
      message: '',
    });
    expect(await clock(frame)).toBe('v2 · запусков: 3 · grey');

    const picky = { hash: HASH.picky, code: codes.picky, uses: [] };
    expect(await update(page, frame, sectionHtml('Новый заголовок'), picky)).toEqual({ outcome: 'fresh', message: '' });
    expect(await clock(frame)).toBe('picky · запусков: 1 · нет');

    const broken = { hash: HASH.broken, code: codes.broken, uses: [] };
    expect(await update(page, frame, sectionHtml('Новый заголовок'), broken)).toEqual({
      outcome: 'failed',
      message: 'нет шарфов',
    });
    expect(await frame.locator('merfy-section').getAttribute('data-merfy-state')).toBe('failed');

    const loads = frameLoads();
    const syntax = { hash: SYNTAX_HASH, code: 'export default {', uses: [] };
    expect((await update(page, frame, sectionHtml('Новый заголовок'), syntax)).outcome).toBe('reloaded');
    await expect.poll(frameLoads).toBe(loads + 1);
    const again = await frameOf(page);
    await again.locator('merfy-section[data-merfy-state="mounted"]').waitFor();
    expect(await clock(again)).toBe('v1 · запусков: 1 · нет');
    await page.close();
  });
});

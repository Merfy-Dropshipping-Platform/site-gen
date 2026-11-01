import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildBehaviors } from '../../build/behaviors';
import { buildCore } from '../../build/core';
import type { Mode } from '../../src/core/types';
import { API_URL } from '../sdk-support';
import { ORIGIN, pageHtml, type PageOptions } from './behaviors-support';

// Поведение countdown в Chromium на сборке как у настоящей страницы: ядро (dist/core.js) и поведения (dist/behaviors/*.js)
// собраны ОТДЕЛЬНО, у каждого своя копия общих модулей, и бандл страницы склеивает готовые файлы. Тест из исходников
// одним esbuild эту границу не видит: таймер в превью конструктора стоял, потому что поведение со своей копией stores.ts
// не находило фасад $now (подписку ведёт ядро — core.watch). Превью (mode: 'preview', preview: watchPreviewReplace) идёт
// по часам устройства: запроса времени нет, цифры в частях появляются сразу.
const PACKAGE_DIR = fileURLToPath(new URL('../..', import.meta.url));
const PARTS =
  '<b id="d" data-part="days"></b>:<b id="h" data-part="hours"></b>:<b id="m" data-part="minutes"></b>:<b id="s" data-part="seconds"></b>';
const CATCH = `window.__ended = []; document.addEventListener('merfy:countdown:end', (event) => window.__ended.push(event.detail));`;

declare global {
  interface Window {
    __ended?: unknown[];
    __ready?: boolean;
  }
}

let browser: Browser;
let dist: string;
let bundle = '';

// Страница, как её собирает сборка магазина: готовые файлы ядра и поведений, секция с uses: ["page"].
async function pageBundle(preview: boolean): Promise<string> {
  const core = JSON.stringify(join(dist, 'core.js'));
  const kit = (file: string): string => JSON.stringify(join(dist, 'behaviors', file));
  const entry = [
    `import { start, page${preview ? ', watchPreviewReplace' : ''} } from ${core};`,
    `import { behaviors } from ${kit('part.js')};`,
    `import { countdown } from ${kit('countdown.js')};`,
    `const section = { name: 'shop:promo', kind: 'section', script: '${'a'.repeat(64)}', uses: ['page'], definition: { mount() {} } };`,
    `start({ parts: [page, behaviors({ list: [countdown] })], sections: [section]${preview ? ', preview: watchPreviewReplace' : ''} });`,
    'window.__ready = true;',
  ].join('\n');
  const result = await build({
    stdin: { contents: entry, resolveDir: PACKAGE_DIR, loader: 'js' },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
    logLevel: 'silent',
  });
  return result.outputFiles[0]?.text ?? '';
}

beforeAll(async () => {
  dist = await mkdtemp(join(tmpdir(), 'merfy-countdown-'));
  await buildCore({ packageDir: PACKAGE_DIR, outDir: dist, core: [], version: 'test' });
  await buildBehaviors({ packageDir: PACKAGE_DIR, outDir: join(dist, 'behaviors'), version: 'test' });
  browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  await browser?.close();
  if (dist !== undefined) await rm(dist, { recursive: true, force: true });
});

interface Opened {
  readonly clock: () => Promise<string>;
  readonly errors: string[];
  readonly page: Awaited<ReturnType<Browser['newPage']>>;
}

async function open(until: string, mode: Mode): Promise<Opened> {
  const body = `<merfy-section data-section="shop:promo" data-section-id="s1" style="display:block"><div data-behavior="countdown" data-until="${until}">${PARTS}</div></merfy-section>`;
  const options: PageOptions = { body, mode, beforeCore: CATCH };
  bundle = await pageBundle(mode === 'preview');
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(`${ORIGIN}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: pageHtml(options) });
    if (path === '/page.js') return route.fulfill({ contentType: 'text/javascript', body: bundle });
    return route.fulfill({ status: 404, body: '' });
  });
  await page.route(`${API_URL}/store/time`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ now: Date.now() }),
    }),
  );
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => window.__ready === true);
  const clock = (): Promise<string> =>
    page.evaluate(() => ['d', 'h', 'm', 's'].map((id) => document.getElementById(id)?.textContent ?? '').join(':'));
  return { clock, errors, page };
}

describe.each<Mode>(['preview', 'live'])('countdown в сборке как у страницы, режим %s', (mode) => {
  it('до даты: цифры в частях появляются и меняются каждую секунду', async () => {
    const opened = await open(new Date(Date.now() + 90_000).toISOString(), mode);
    await opened.page.waitForFunction(() => document.getElementById('s')?.textContent !== '');
    const first = await opened.clock();
    expect(first).toMatch(/^0:00:01:\d\d$/);
    await opened.page.waitForFunction(
      (before) => ['d', 'h', 'm', 's'].map((id) => document.getElementById(id)?.textContent ?? '').join(':') !== before,
      first,
    );
    expect(opened.errors).toEqual([]);
    await opened.page.close();
  });

  it('дата уже прошла: нули и одно событие merfy:countdown:end', async () => {
    const opened = await open(new Date(Date.now() - 60_000).toISOString(), mode);
    await opened.page.waitForFunction(() => (window.__ended ?? []).length > 0);
    expect(await opened.clock()).toBe('0:00:00:00');
    expect(await opened.page.evaluate(() => window.__ended)).toEqual([{ section: 'shop:promo', id: 's1' }]);
    expect(opened.errors).toEqual([]);
    await opened.page.close();
  });
});

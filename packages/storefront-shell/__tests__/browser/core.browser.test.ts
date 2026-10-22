import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildCore } from '../../build/core';
import { startFixtureServer, type FixtureServer } from './server';

// Ядро секций в настоящем Chromium (design.md блока 5, раздел 8, п. 3). Бандл страницы собирается так, как его будет
// собирать сборка магазина в части 5б (раздел 3.10): вход — строка с start, частями и модулями секций, модуль секции —
// уже без defineSection. Страница — fixtures/browser/core/index.html; её встроенный скрипт пишет копии событий ядра в
// window.__merfy.
const PACKAGE_DIR = fileURLToPath(new URL('../..', import.meta.url));
const FIXTURES_DIR = fileURLToPath(new URL('../../fixtures/browser/core', import.meta.url));
const DIST_DIR = fileURLToPath(new URL('../../dist-test/core-browser', import.meta.url));
const SECTIONS = [
  { name: 'shop:scarf-match', file: 'scarf-match.js', kind: 'section', uses: [], script: 'a' },
  { name: 'shop:broken', file: 'broken.js', kind: 'section', uses: [], script: 'b' },
  { name: 'shop:cart-badge', file: 'cart-badge.js', kind: 'section', uses: ['cart'], script: 'c' },
  { name: 'shop:ticker', file: 'ticker.js', kind: 'section', uses: [], script: 'd' },
  { name: 'shop:geo', file: 'geo.js', kind: 'global', uses: [], script: 'e' },
];

function pageEntry(): string {
  const imports = SECTIONS.map(
    (section, index) => `import s${index} from ${JSON.stringify(join(FIXTURES_DIR, 'sections', section.file))};`,
  );
  const list = SECTIONS.map(
    (section, index) =>
      `{ name: ${JSON.stringify(section.name)}, kind: ${JSON.stringify(section.kind)}, ` +
      `script: ${JSON.stringify(section.script.repeat(64))}, uses: ${JSON.stringify(section.uses)}, definition: s${index} }`,
  );
  return [
    `import { start, auth, cart, favorites } from ${JSON.stringify(join(DIST_DIR, 'core.js'))};`,
    ...imports,
    `start({ parts: [auth, cart, favorites], sections: [${list.join(', ')}] });`,
  ].join('\n');
}

let browser: Browser;
let server: FixtureServer;

beforeAll(async () => {
  await rm(DIST_DIR, { recursive: true, force: true });
  await buildCore({
    packageDir: PACKAGE_DIR,
    outDir: DIST_DIR,
    core: ['auth', 'cart', 'favorites'],
    version: '0.0.0-test',
  });
  const page = await build({
    stdin: { contents: pageEntry(), resolveDir: PACKAGE_DIR, loader: 'js' },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    write: false,
    logLevel: 'silent',
  });
  await mkdir(join(DIST_DIR, 'b'), { recursive: true });
  await writeFile(join(DIST_DIR, 'b', 'page.js'), page.outputFiles[0]?.contents ?? new Uint8Array());
  server = await startFixtureServer(FIXTURES_DIR, DIST_DIR);
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

async function openPage() {
  const page = await browser.newPage();
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.goto(`${server.origin}/`);
  await page.waitForFunction('window.__merfy.some((event) => event.name === "merfy:page:view")');
  return { page, consoleErrors };
}

// Копии событий ядра без тиков таймера: «имя секция-или-путь».
const pageLog = (page: Page): Promise<unknown> =>
  page.evaluate(
    'window.__merfy.filter((event) => event.name !== "shop:ticker:tick")' +
      '.map((event) => [event.name, event.detail.section ?? event.detail.path ?? ""].join(" ").trim())',
  );
const ticks = (page: Page): Promise<unknown> =>
  page.evaluate('window.__merfy.filter((event) => event.name === "shop:ticker:tick").length');
const failureLines = (lines: readonly string[]): string[] => lines.filter((line) => line.startsWith('Сбой секции'));

describe('ядро секций в Chromium', () => {
  it('порядок страницы, глобальный скрипт — после, потом page:ready и page:view; сломанная — failed без inert', async () => {
    const { page, consoleErrors } = await openPage();
    expect(await pageLog(page)).toEqual([
      'merfy:section:mount shop:scarf-match',
      'merfy:section:error shop:broken',
      'merfy:section:mount shop:buy',
      'merfy:section:mount shop:cart-badge',
      'merfy:section:mount shop:ticker',
      'merfy:section:mount shop:geo',
      'merfy:page:ready',
      'merfy:page:view /',
    ]);
    const broken = page.locator('merfy-section[data-section-id="broken-1"]');
    expect(await broken.getAttribute('data-merfy-state')).toBe('failed');
    expect(await broken.getAttribute('inert')).toBeNull();
    expect(await broken.locator('button').getAttribute('aria-disabled')).toBe('true');
    expect(await page.locator('merfy-section[data-section-id="static-1"]').getAttribute('data-merfy-state')).toBeNull();
    await broken.locator('a').click();
    expect(await page.evaluate('location.hash')).toBe('#after-broken');
    expect(failureLines(consoleErrors)).toEqual(['Сбой секции shop:broken#broken-1 (mount): сломалась при запуске']);
    await page.close();
  });

  it('«Подбор шарфа» отмечает пальто; «В корзину» без скрипта секции — значок корзины по ctx.watch', async () => {
    const { page } = await openPage();
    const pick = page.locator('merfy-section[data-section-id="pick-1"]');
    await pick.locator('[data-coat="black"]').click();
    expect(await pick.locator('[data-coat="black"]').getAttribute('aria-pressed')).toBe('true');
    expect(await pick.locator('[data-coat="grey"]').getAttribute('aria-pressed')).toBe('false');
    expect(await pick.locator('[data-ref="hint"]').textContent()).toBe('Подберите шарф: black');
    await page.locator('merfy-section[data-section-id="buy-1"] button').click();
    await expect.poll(() => page.locator('[data-ref="count"]').textContent()).toBe('2');
    await page.close();
  });

  it('удалённая секция больше не тикает; перенос узла не перезапускает секцию', async () => {
    const { page } = await openPage();
    await expect.poll(() => ticks(page)).toBeGreaterThan(2);
    await page.evaluate('document.querySelector(\'merfy-section[data-section-id="ticker-1"]\').remove()');
    const before = await ticks(page);
    await page.waitForTimeout(3000);
    expect(await ticks(page)).toBe(before);
    await page.evaluate('document.body.append(document.querySelector(\'merfy-section[data-section-id="pick-1"]\'))');
    const pick = page.locator('merfy-section[data-section-id="pick-1"]');
    await pick.locator('[data-coat="grey"]').click();
    expect(await pick.locator('[data-coat="grey"]').getAttribute('aria-pressed')).toBe('true');
    expect(
      await page.evaluate(
        'window.__merfy.filter((event) => event.name === "merfy:section:mount" && event.detail.section === "shop:scarf-match").length',
      ),
    ).toBe(1);
    await page.close();
  });
});

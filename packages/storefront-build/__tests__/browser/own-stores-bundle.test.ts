import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sha256 } from '../../src/canonical';
import type { CodeAssets } from '../../src/code';
import type { CodeSection } from '../../src/inputs';
import { renderShopPage, type RenderedPage } from '../../src/page';
import type { PageRender } from '../../src/sections-render';
import { readShellBuild, type ShellBuild } from '../../src/shell';
import { changedInputs } from '../support';
import { fakeRender, novaTokens } from '../support-theme';

// Свои сторы в настоящем Chromium (свои сторы, 01.11): страница из renderShopPage с настоящим ядром (dist/core.js — перед
// тестом pnpm --filter @merfy/shell build). Секция «Окно» шлёт событие по кнопке; стор shop:clicks считает нажатия и
// помнит их у посетителя (ctx.storage); стор shop:offer читает shop:clicks и решает «показать»; секция видит offer.
// Стор shop:broken падает в start — страница и секция работают; стор shop:unused никто не читает — его нет в бандле.
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const SECTION_SCRIPT =
  'export default {mount(e,c){c.watch(c.stores["shop:offer"],v=>c.ref("offer")?.text(String(v)));' +
  'c.watch(c.stores["shop:clicks"],v=>c.ref("clicks")?.text(String(v)))},' +
  'actions:{click(t,c){c.emit("clicked",{})}}};';
const CLICKS_SCRIPT =
  'export default {value:0,start(c,s){const n=c.storage.get("count");let k=typeof n==="number"?n:0;s(k);' +
  'c.listen("shop:popup:clicked",()=>{k+=1;c.storage.set("count",k);s(k)})}};';
const OFFER_SCRIPT =
  'export default {value:"нет",start(c,s){c.watch(c.stores["shop:clicks"],n=>s(n>=2?"показать":"нет"))}};';
const BROKEN_SCRIPT = 'export default {value:1,start(){throw new Error("стор сломался")}};';
const UNUSED_SCRIPT = 'export default {value:0,start(){globalThis.unusedStore="started"}};';
const RENDER_MODULE = 'export default "shop:popup";';
const TEMPLATE =
  '<button type="button" data-action="click">Нажать</button><span data-ref="clicks">…</span><span data-ref="offer">…</span>';

function code(name: string, kind: CodeSection['kind'], script: string, uses: string[]): CodeSection {
  return {
    name,
    kind,
    hash: sha256(`${name}${script}`),
    render: kind === 'section' ? sha256(RENDER_MODULE) : null,
    script: sha256(script),
    meta: { uses, parts: [], classes: [] },
  };
}

const SECTIONS: readonly [CodeSection, string][] = [
  [
    code('shop:popup', 'section', SECTION_SCRIPT, ['store:shop:broken', 'store:shop:clicks', 'store:shop:offer']),
    SECTION_SCRIPT,
  ],
  [code('shop:clicks', 'store', CLICKS_SCRIPT, []), CLICKS_SCRIPT],
  [code('shop:offer', 'store', OFFER_SCRIPT, ['store:shop:clicks']), OFFER_SCRIPT],
  [code('shop:broken', 'store', BROKEN_SCRIPT, []), BROKEN_SCRIPT],
  [code('shop:unused', 'store', UNUSED_SCRIPT, []), UNUSED_SCRIPT],
];

let browser: Browser;
let origin = '';
let closeServer: () => Promise<void> = () => Promise.resolve();
const pages = new Map<string, Uint8Array>();
let rendered: RenderedPage;

async function renderHome(core: ShellBuild): Promise<RenderedPage> {
  const inputs = changedInputs((changed) => {
    changed.shell = { version: core.version, hash: core.hash, parts: core.parts };
    changed.env = { apiUrl: `${origin}/api`, analyticsUrl: `${origin}/a` };
    changed.code = {
      sections: SECTIONS.map(([section]) => section),
      pages: { home: [{ id: 'popup-1', section: 'shop:popup', settings: {} }] },
      globals: [],
    };
  });
  const renders = new Map([[sha256(RENDER_MODULE), RENDER_MODULE]]);
  const modules = new Map(SECTIONS.map(([, script]): [string, Uint8Array] => [sha256(script), Buffer.from(script)]));
  const assets: CodeAssets = { shell: core, modules, renders };
  const render = (): Promise<string> => Promise.resolve(TEMPLATE);
  const page: PageRender = { sections: { modules: renders, render }, mode: 'live', code: assets };
  return renderShopPage(inputs, '/', { tokens: novaTokens, render: fakeRender }, page);
}

async function openHome(page: Page): Promise<void> {
  await page.goto(`${origin}/`);
  await page.waitForFunction(() => document.querySelector('[data-ref="offer"]')?.textContent !== '…');
}

beforeAll(async () => {
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    const file = pages.get(path);
    if (file === undefined) return void response.writeHead(path.startsWith('/a/') ? 204 : 404).end();
    const type = path.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8';
    response.writeHead(200, { 'content-type': type }).end(file);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  origin = `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`;
  closeServer = () =>
    new Promise((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  rendered = await renderHome(await readShellBuild(ROOT));
  pages.set('/', rendered.file.content);
  if (rendered.bundle !== undefined) pages.set(`/${rendered.bundle.path}`, rendered.bundle.content);
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  await closeServer();
});

describe('свои сторы в Chromium', () => {
  it('стор читает другой стор, секция видит значение; стор помнит нажатия у посетителя после перезагрузки', async () => {
    const page = await browser.newPage();
    await openHome(page);
    expect(await page.textContent('[data-ref="offer"]')).toBe('нет');
    await page.click('[data-action="click"]');
    await page.click('[data-action="click"]');
    await page.waitForFunction(() => document.querySelector('[data-ref="offer"]')?.textContent === 'показать');
    expect(await page.textContent('[data-ref="clicks"]')).toBe('2');
    await openHome(page);
    expect(await page.textContent('[data-ref="clicks"]')).toBe('2');
    expect(await page.textContent('[data-ref="offer"]')).toBe('показать');
    expect(await page.evaluate(() => localStorage.getItem('merfy:s:shop:clicks:count'))).toBe('2');
    await page.close();
  });

  it('сбой стора — merfy:section:error с его именем; секция смонтирована и работает', async () => {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const seen: unknown[] = [];
      Reflect.set(window, 'merfyFailures', seen);
      document.addEventListener('merfy:section:error', (event) => {
        seen.push(event instanceof CustomEvent ? event.detail : null);
      });
    });
    await openHome(page);
    const failures = await page.evaluate((): unknown => Reflect.get(window, 'merfyFailures'));
    expect(failures).toMatchObject([
      { section: 'shop:broken', id: 'shop:broken', stage: 'mount', message: 'стор сломался' },
    ]);
    expect(await page.getAttribute('[data-section-id="popup-1"]', 'data-merfy-state')).toBe('mounted');
    expect(errors).toEqual([]);
    await page.close();
  });

  it('стор, который никто не читает, в бандл страницы не попал', async () => {
    const page = await browser.newPage();
    await openHome(page);
    expect(await page.evaluate((): unknown => Reflect.get(window, 'unusedStore'))).toBeUndefined();
    const bundle = rendered.bundle === undefined ? '' : new TextDecoder().decode(rendered.bundle.content);
    expect(bundle).not.toContain('unusedStore');
    expect(bundle).toContain('стор сломался');
    await page.close();
  });
});

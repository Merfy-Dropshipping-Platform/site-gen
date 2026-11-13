import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sha256 } from '../../src/canonical';
import type { CodeAssets } from '../../src/code';
import type { CodeSection } from '../../src/inputs';
import { renderShopPage, type RenderedPage } from '../../src/page';
import type { PageRender, SectionRenderRequest } from '../../src/sections-render';
import { readShellBuild, type ShellBuild } from '../../src/shell';
import { changedInputs } from '../support';
import { fakeRender, novaTokens } from '../support-theme';

// Библиотеки SDK и ctx.scroll в бандле опубликованной страницы (13.11, части 2б и 2в спеки анимаций): настоящие
// dist/core.js и dist/behaviors пакета @merfy/shell (перед тестом: pnpm --filter @merfy/shell build). Страница с секцией,
// у которой "lib:motion" в uses, получает адаптер полного Motion; страница без — нет, даже если в скрипте ctx.animate.
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const TEMPLATES: Record<string, string> = {
  'shop:counter': '<span data-ref="count" id="count">0</span>',
  'shop:glow': '<div data-ref="box" id="box" style="height:40px">свечение</div>',
  'shop:smooth': '<div data-ref="spot" id="spot" style="height:3000px">длинная</div>',
};
// 13.11, пункт 7: плавная прокрутка Lenis по "lib:lenis" — код Lenis только в бандле такой страницы.
const SMOOTH =
  'export default {mount(e,c){globalThis.smoothTo=()=>c.lib.lenis.scrollTo(500,{immediate:true});globalThis.smoothReady=true}};';
const COUNTER =
  'export default {mount(e,c){const n=e.ref("count");c.lib.motion.tween(0,12000,{duration:200},v=>n.text(String(Math.round(v)))).finished.then(()=>{globalThis.counted=true})}};';
const GLOW =
  'export default {mount(e,c){const a=c.animate(e.ref("box"),{opacity:[0,1]},{duration:1000});c.scroll(e,a);globalThis.glowDone=true}};';
const SCRIPTS: Record<string, string> = { 'shop:counter': COUNTER, 'shop:glow': GLOW, 'shop:smooth': SMOOTH };
const USES: Record<string, string[]> = {
  'shop:counter': ['lib:motion'],
  'shop:glow': [],
  'shop:smooth': ['lib:lenis'],
};

const renderModule = (name: string): string => `export default ${JSON.stringify(name)};`;
const RENDERS = new Map(
  Object.keys(TEMPLATES).map((name): [string, string] => [sha256(renderModule(name)), renderModule(name)]),
);

function section(name: string): CodeSection {
  const script = SCRIPTS[name] ?? '';
  return {
    name,
    kind: 'section',
    hash: sha256(`${name}${script}`),
    render: sha256(renderModule(name)),
    script: sha256(script),
    meta: { uses: USES[name] ?? [], parts: [], classes: [] },
  };
}

async function renderHome(core: ShellBuild, origin: string, names: string[]): Promise<RenderedPage> {
  const inputs = changedInputs((changed) => {
    changed.shell = { version: core.version, hash: core.hash, parts: core.parts };
    changed.env = { apiUrl: `${origin}/api`, analyticsUrl: `${origin}/a` };
    changed.code = {
      sections: names.map(section),
      pages: { home: names.map((name, index) => ({ id: `s${index}`, section: name, settings: {} })) },
      globals: [],
    };
  });
  const modules = new Map(
    names.map((name): [string, Uint8Array] => [sha256(SCRIPTS[name] ?? ''), Buffer.from(SCRIPTS[name] ?? '')]),
  );
  const assets: CodeAssets = { shell: core, modules, renders: RENDERS };
  const render = (request: SectionRenderRequest): Promise<string> => Promise.resolve(TEMPLATES[request.section] ?? '');
  const page: PageRender = { sections: { modules: RENDERS, render }, mode: 'live', code: assets };
  return renderShopPage(inputs, '/', { tokens: novaTokens, render: fakeRender }, page);
}

let browser: Browser;
let withLib: RenderedPage;
let withoutLib: RenderedPage;
let withLenis: RenderedPage;
const files = new Map<string, Uint8Array>();
let origin = '';
let closeServer: () => Promise<void> = () => Promise.resolve();

beforeAll(async () => {
  const server = createServer((request, response) => {
    const file = files.get(new URL(request.url ?? '/', origin).pathname);
    if (file === undefined) return void response.writeHead(404).end();
    const type = (request.url ?? '').endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8';
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
  const core = await readShellBuild(ROOT);
  withLib = await renderHome(core, origin, ['shop:counter', 'shop:glow']);
  withoutLib = await renderHome(core, origin, ['shop:glow']);
  withLenis = await renderHome(core, origin, ['shop:smooth']);
  files.set('/', withLib.file.content);
  files.set('/plain', withoutLib.file.content);
  files.set('/smooth', withLenis.file.content);
  for (const page of [withLib, withoutLib, withLenis])
    if (page.bundle !== undefined) files.set(`/${page.bundle.path}`, page.bundle.content);
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  await closeServer();
});

const text = (content: Uint8Array | undefined): string =>
  content === undefined ? '' : Buffer.from(content).toString('utf8');

describe('lib:motion и ctx.scroll в бандле страницы', () => {
  it('код полного Motion (класс Timeline) — только в бандле страницы с "lib:motion"; scroll.js — в обоих', () => {
    const rich = text(withLib.bundle?.content);
    const light = text(withoutLib.bundle?.content);
    expect(rich).toContain('isRebuilding');
    expect(light).not.toContain('isRebuilding');
    expect(rich.length - light.length).toBeGreaterThan(40_000);
    // scroll из Motion: свой опрос прокрутки — scrollInfo читает scrollHeight.
    expect(light).toContain('scrollHeight');
  });

  it('в Chromium: счётчик ctx.lib.motion.tween доходит до 12000, ctx.scroll без ошибок', async () => {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) errors.push(message.text());
    });
    await page.goto(`${origin}/`);
    await page.waitForFunction(() => Reflect.get(window, 'counted') === true);
    expect(await page.textContent('#count')).toBe('12000');
    expect(await page.evaluate(() => Reflect.get(window, 'glowDone') === true)).toBe(true);
    expect(errors).toEqual([]);
    await page.close();
  });
});

describe('lib:lenis в бандле страницы', () => {
  it('код Lenis — только в бандле страницы с "lib:lenis"', () => {
    expect(text(withLenis.bundle?.content)).toContain('lenisVersion');
    expect(text(withLib.bundle?.content)).not.toContain('lenisVersion');
    expect(text(withoutLib.bundle?.content)).not.toContain('lenisVersion');
  });

  it('в Chromium: Lenis на <html>, ctx.lib.lenis.scrollTo прокручивает страницу', async () => {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) errors.push(message.text());
    });
    await page.goto(`${origin}/smooth`);
    await page.waitForFunction(() => Reflect.get(window, 'smoothReady') === true);
    expect(await page.evaluate(() => document.documentElement.classList.contains('lenis'))).toBe(true);
    await page.evaluate(() => Reflect.apply(Reflect.get(window, 'smoothTo'), window, []));
    expect(await page.evaluate(() => window.scrollY)).toBe(500);
    expect(errors).toEqual([]);
    await page.close();
  });
});

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { MOTION_HEAD_SCRIPT } from '@merfy/shell/behaviors/motion-css';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sha256 } from '../../src/canonical';
import type { CodeAssets } from '../../src/code';
import type { CodeSection } from '../../src/inputs';
import { renderShopPage, type RenderedPage } from '../../src/page';
import type { PageRender, SectionRenderRequest } from '../../src/sections-render';
import { readShellBuild, type ShellBuild } from '../../src/shell';
import { changedInputs } from '../support';
import { fakeRender, novaTokens } from '../support-theme';

// Поведения и движение на странице опубликованного сайта в настоящем Chromium (блок 6, часть 6б): страница из
// renderShopPage с настоящими dist/core.js и dist/behaviors пакета @merfy/shell (перед тестом: pnpm --filter @merfy/shell
// build). Секции — разметка с data-behavior и data-animate, одна со скриптом, который вызывает ctx.animate.
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const SLIDE = (text: string): string => `<div data-part="slide" style="flex:0 0 100%;height:40px">${text}</div>`;
const TEMPLATES: Record<string, string> = {
  'shop:slides': `<div data-behavior="carousel" data-effect="fade" data-change="700" data-autoplay="1">
    <h2 id="slides-title" data-animate="appear">Слайд-шоу</h2>
    <div data-part="viewport" style="overflow:hidden;width:400px"><div data-part="container" style="display:flex">${SLIDE('Первый')}${SLIDE('Второй')}${SLIDE('Третий')}</div></div>
    <button type="button" id="prev" data-part="prev">Назад</button><span id="counter" data-part="counter"></span><button type="button" id="next" data-part="next">Вперёд</button>
  </div>`,
  'shop:questions': `<div data-behavior="accordion"><details id="d1"><summary id="s1">Вопрос</summary><div id="c1" data-part="content">Ответ</div></details></div>`,
  'shop:glow': '<div data-ref="box" id="box">свечение</div>',
  'shop:plain': '<p>просто текст</p>',
};
const GLOW =
  'export default {mount(e,c){c.animate(e.ref("box"),{opacity:[0.5,1]},{duration:50});globalThis.glowDone=true}};';

interface Shop {
  origin: string;
  pages: Map<string, Uint8Array>;
  close: () => Promise<void>;
}

let browser: Browser;
let shop: Shop;
let rich: RenderedPage;
let plain: RenderedPage;

const renderModule = (name: string): string => `export default ${JSON.stringify(name)};`;
const RENDERS = new Map(
  Object.keys(TEMPLATES).map((name): [string, string] => [sha256(renderModule(name)), renderModule(name)]),
);

function section(name: string, script: string | null): CodeSection {
  const render = sha256(renderModule(name));
  return { name, kind: 'section', hash: sha256(`${name}${script ?? ''}`), render, script: script === null ? null : sha256(script) };
}

async function answer(request: IncomingMessage, response: ServerResponse, current: Shop): Promise<void> {
  const path = new URL(request.url ?? '/', current.origin).pathname;
  if (request.method === 'POST') return void response.writeHead(204).end();
  const file = current.pages.get(path);
  if (file === undefined) return void response.writeHead(404).end();
  const type = path.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8';
  response.writeHead(200, { 'content-type': type }).end(file);
}

async function startShop(): Promise<Shop> {
  const current: Shop = { origin: '', pages: new Map(), close: () => Promise.resolve() };
  const server = createServer((request, response) => {
    answer(request, response, current).catch(() => response.writeHead(500).end());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  current.origin = `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`;
  current.close = () =>
    new Promise((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  return current;
}

async function renderHome(core: ShellBuild, origin: string, names: string[]): Promise<RenderedPage> {
  const sections = names.map((name) => section(name, name === 'shop:glow' ? GLOW : null));
  const inputs = changedInputs((changed) => {
    changed.shell = { version: core.version, hash: core.hash, parts: core.parts };
    changed.env = { apiUrl: `${origin}/api`, analyticsUrl: `${origin}/a` };
    changed.code = {
      sections,
      pages: { home: names.map((name, index) => ({ id: `s${index}`, section: name, settings: {} })) },
      globals: [],
    };
  });
  const modules = new Map<string, Uint8Array>([[sha256(GLOW), Buffer.from(GLOW)]]);
  const assets: CodeAssets = { shell: core, modules, renders: RENDERS };
  const render = (request: SectionRenderRequest): Promise<string> => Promise.resolve(TEMPLATES[request.section] ?? '');
  const page: PageRender = { sections: { modules: RENDERS, render }, mode: 'live', code: assets };
  return renderShopPage(inputs, '/', { tokens: novaTokens, render: fakeRender }, page);
}

// Страница открыта с включённым выбором «Появление секций» (data-motion-reveal="on" у <html>, как его ставит тема) или
// без него; Element.prototype.animate записывает id элементов, у которых запускалась анимация.
async function openHome(reveal: boolean): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) errors.push(message.text());
  });
  await page.addInitScript((on: boolean) => {
    const animated: string[] = [];
    Reflect.set(window, '__animated', animated);
    const original = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, ...args: Parameters<Element['animate']>) {
      animated.push(this.id);
      return original.apply(this, args);
    };
    if (on) document.addEventListener('readystatechange', () => document.documentElement.setAttribute('data-motion-reveal', 'on'), { once: true });
  }, reveal);
  await page.goto(`${shop.origin}/`);
  await page.waitForFunction(() => document.querySelector('#counter')?.textContent === '1');
  return { page, errors };
}

beforeAll(async () => {
  shop = await startShop();
  const core = await readShellBuild(ROOT);
  rich = await renderHome(core, shop.origin, ['shop:slides', 'shop:questions', 'shop:glow']);
  plain = await renderHome(core, shop.origin, ['shop:plain']);
  shop.pages.set('/', rich.file.content);
  if (rich.bundle !== undefined) shop.pages.set(`/${rich.bundle.path}`, rich.bundle.content);
  shop.pages.set('/plain', plain.file.content);
  if (plain.bundle !== undefined) shop.pages.set(`/${plain.bundle.path}`, plain.bundle.content);
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  await shop?.close();
});

const text = (content: Uint8Array | undefined): string => (content === undefined ? '' : Buffer.from(content).toString('utf8'));

describe('страница с поведениями', () => {
  it('<head>: флаг движения и запасной CSS перед одним бандлом; у страницы без поведений их нет, бандл лёгкий', () => {
    const html = text(rich.file.content);
    expect(html).toContain(`<script>${MOTION_HEAD_SCRIPT}</script><style id="merfy-motion">`);
    expect(html.match(/<script type="module"[^>]*>/g)).toHaveLength(1);
    const light = text(plain.file.content);
    expect(light).not.toContain('merfy-motion');
    const heavy = rich.bundle?.content.length ?? 0;
    const small = plain.bundle?.content.length ?? 0;
    expect(small).toBeGreaterThan(0);
    expect(heavy - small).toBeGreaterThan(30_000);
    expect(text(plain.bundle?.content)).not.toContain('aria-roledescription');
    expect(text(rich.bundle?.content)).toContain('aria-roledescription');
  });

  it('слайдер: счётчик 1, «Вперёд» — 2, дальше сам раз в секунду; аккордеон открывается; ctx.animate есть; ошибок нет', async () => {
    const { page, errors } = await openHome(false);
    await page.click('#next');
    await page.waitForFunction(() => document.querySelector('#counter')?.textContent === '2');
    await page.waitForFunction(() => document.querySelector('#counter')?.textContent === '3', undefined, { timeout: 6000 });
    await page.click('#s1');
    expect(await page.getAttribute('#d1', 'open')).not.toBeNull();
    expect(await page.evaluate(() => Reflect.get(window, 'glowDone'))).toBe(true);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('появление: при data-motion-reveal="on" заголовок анимируется и флаг движения снят; без выбора — заголовок без анимации', async () => {
    const on = await openHome(true);
    await on.page.waitForFunction(() => !document.documentElement.hasAttribute('data-merfy-motion'));
    const animatedOn = await on.page.evaluate(() => Reflect.get(window, '__animated'));
    expect(animatedOn).toContain('slides-title');
    expect(on.errors).toEqual([]);
    await on.page.close();
    const off = await openHome(false);
    await off.page.waitForFunction(() => !document.documentElement.hasAttribute('data-merfy-motion'));
    expect(await off.page.evaluate(() => Reflect.get(window, '__animated'))).not.toContain('slides-title');
    expect(
      await off.page.evaluate(() => {
        const element = document.getElementById('slides-title');
        return element === null ? '' : getComputedStyle(element).opacity;
      }),
    ).toBe('1');
    await off.page.close();
  });
});

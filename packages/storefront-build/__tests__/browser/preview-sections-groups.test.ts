import { chromium, type Browser, type Page } from 'playwright';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PREVIEW_AGENT } from '../../src/preview-agent';
import { PREVIEW_SECTIONS_AGENT } from '../../src/preview-sections-agent';

// Группы и переход по ссылке в превью (блок 1 «Секций и SDK», часть 4, Р1-4-11, Р1-4-12) в настоящем Chromium.
interface Message {
  type: string;
  [key: string]: unknown;
}

declare global {
  interface Window {
    received: Message[];
    send: (message: unknown) => void;
  }
}

const ORIGIN = 'http://preview.test';
const FRAME = `${ORIGIN}/api/sites/s1/preview`;
const sectionHtml = (name: string, id: string, inner = `<p>${name} ${id}</p>`): string =>
  `<merfy-section data-section="shop:${name}" data-section-id="${id}" class="py-section">${inner}</merfy-section>`;
const HEADER_LINKS =
  '<nav><a href="/o-nas">О нас</a> <a href="https://merfy.ru/">Merfy</a> <a href="//evil.example/">Чужая</a></nav>' +
  '<a data-merfy-block="cart-1" href="/cart">Корзина</a>';
const FRAME_HTML =
  `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">${sectionHtml('header', 'header-1', HEADER_LINKS)}` +
  `<main>${sectionHtml('hero', 'hero-1')}</main>${sectionHtml('footer', 'footer-1')}` +
  `<script>${PREVIEW_AGENT}</script><script>${PREVIEW_SECTIONS_AGENT}</script></body></html>`;
const PARENT_HTML = `<!doctype html><html><body><iframe id="preview" src="${FRAME}" style="width:1200px;height:800px"></iframe><script>
window.received = [];
window.addEventListener('message', function (event) { window.received.push(event.data); });
window.send = function (message) { document.getElementById('preview').contentWindow.postMessage(message, '*'); };
</script></body></html>`;

let browser: Browser;
let page: Page;
const bodies: unknown[] = [];
const requestSchema = z.object({ instance: z.object({ id: z.string(), section: z.string() }) });

const received = (): Promise<Message[]> => page.evaluate(() => window.received);
const ofType = async (type: string): Promise<Message[]> => (await received()).filter((message) => message.type === type);
const send = (message: unknown): Promise<void> => page.evaluate((value) => window.send(value), message);
const frame = () => page.frameLocator('#preview');
// Порядок в <body>: id секций и MAIN; внутри <main> — id её секций.
const bodyOrder = (): Promise<string[]> =>
  frame()
    .locator('body > merfy-section, body > main')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-section-id') ?? node.tagName));
const mainOrder = (): Promise<string[]> =>
  frame()
    .locator('main > merfy-section')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-section-id') ?? ''));
const block = (id: string, group: string, propsHash = id) => ({
  id,
  type: `shop:${id.split('-')[0] ?? ''}`,
  props: { id, settings: {}, group },
  propsHash,
});

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.route(`${ORIGIN}/parent`, (route) => route.fulfill({ contentType: 'text/html', body: PARENT_HTML }));
  await page.route(FRAME, (route) => route.fulfill({ contentType: 'text/html', body: FRAME_HTML }));
  await page.route(`${FRAME}/block`, (route) => {
    const raw: unknown = JSON.parse(route.request().postData() ?? '{}');
    bodies.push(raw);
    const body = requestSchema.parse(raw);
    const html = sectionHtml(body.instance.section.slice('shop:'.length), body.instance.id);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ html, css: '' }) });
  });
  await page.goto(`${ORIGIN}/parent`);
  // expect.poll вне теста vitest не позволяет — тот же опрос циклом.
  for (let attempt = 0; attempt < 200 && (await ofType('ready')).length === 0; attempt += 1)
    await page.waitForTimeout(50);
  await send({ type: 'init' });
});

afterAll(async () => {
  await browser.close();
});

describe('группы в превью', () => {
  it('reconcile: шапка — до <main>, секции страницы — в <main>, подвал — после; новая секция — на своё место', async () => {
    const blocks = [block('header-1', 'header'), block('hero-1', 'page'), block('page-2', 'page'), block('footer-1', 'footer')];
    await send({ type: 'reconcile', version: 1, blocks });
    await expect.poll(async () => (await ofType('reconcile-ack')).at(-1)).toMatchObject({ version: 1, ok: true, applied: 1 });
    expect(await bodyOrder()).toEqual(['header-1', 'MAIN', 'footer-1']);
    expect(await mainOrder()).toEqual(['hero-1', 'page-2']);
  });

  it('reconcile: новая секция подвала по порядку списка — сразу после <main>, до прежнего подвала', async () => {
    const blocks = [block('header-1', 'header'), block('hero-1', 'page'), block('footer-2', 'footer'), block('footer-1', 'footer')];
    await send({ type: 'reconcile', version: 2, blocks });
    await expect.poll(async () => (await ofType('reconcile-ack')).at(-1)).toMatchObject({ version: 2, ok: true });
    expect(await bodyOrder()).toEqual(['header-1', 'MAIN', 'footer-2', 'footer-1']);
    expect(await mainOrder()).toEqual(['hero-1']);
  });
});

describe('переход по ссылке', () => {
  it('ссылка на свою страницу — select-block, потом navigate; превью не уходит со страницы', async () => {
    const before = (await received()).length;
    await frame().getByText('О нас').click();
    await expect.poll(async () => (await received()).slice(before)).toEqual([
      { type: 'select-block', blockId: 'header-1' },
      { type: 'navigate', path: '/o-nas' },
    ]);
    expect(await bodyOrder()).toContain('header-1');
  });

  it('ссылка подпункта — select-subsection, потом navigate', async () => {
    const before = (await received()).length;
    await frame().getByText('Корзина').click();
    await expect.poll(async () => (await received()).slice(before).map((message) => message.type)).toEqual([
      'select-subsection',
      'navigate',
    ]);
    expect((await ofType('navigate')).at(-1)).toEqual({ type: 'navigate', path: '/cart' });
  });

  it('чужая ссылка и «//…» — только выбор секции, без navigate', async () => {
    const navigations = (await ofType('navigate')).length;
    await frame().getByText('Merfy').click();
    await frame().getByText('Чужая').click();
    await expect.poll(async () => (await ofType('select-block')).length).toBeGreaterThan(1);
    expect((await ofType('navigate')).length).toBe(navigations);
  });
});

describe('меню и настройки темы в запросе блока', () => {
  it('update-block: props.menus и props.theme — в теле POST preview/block', async () => {
    const menus = [{ id: 'main', title: 'Главное меню', items: [{ label: 'О нас', url: '/o-nas' }] }];
    const theme = { 'social-telegram': 'https://t.me/scarves' };
    const props = { id: 'header-1', settings: {}, group: 'header', menus, theme };
    await send({ type: 'update-block', blockId: 'header-1', blockType: 'shop:header', props });
    await expect.poll(() => bodies.at(-1)).toEqual({
      instance: { id: 'header-1', section: 'shop:header', settings: {} },
      menus,
      theme,
    });
  });
});

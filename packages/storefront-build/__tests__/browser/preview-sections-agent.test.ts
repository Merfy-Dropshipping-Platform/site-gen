import { chromium, type Browser, type Page } from 'playwright';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PREVIEW_AGENT } from '../../src/preview-agent';
import { PREVIEW_SECTIONS_AGENT } from '../../src/preview-sections-agent';

// Скрипт превью секций в настоящем Chromium (блок 1 «Секций и SDK»): родительская страница с iframe превью, сообщения
// postMessage в обе стороны, POST preview/block — подставной ответ через page.route.
interface Message {
  type: string;
  [key: string]: unknown;
}

// Окно родительской страницы: список пришедших сообщений и отправка в iframe.
declare global {
  interface Window {
    received: Message[];
    send: (message: unknown) => void;
  }
}

const ORIGIN = 'http://preview.test';
const FRAME = `${ORIGIN}/api/sites/s1/preview`;
const section = (id: string, text: string): string =>
  `<merfy-section data-section="shop:hero" data-section-id="${id}" class="py-section"><h2>${text}</h2></merfy-section>`;
const FRAME_HTML = `<!doctype html><html><head></head><body style="margin:0;padding-top:60px"><main>${section('hero-1', 'Первый')}${section('hero-2', 'Второй')}</main><script>${PREVIEW_AGENT}</script><script>${PREVIEW_SECTIONS_AGENT}</script></body></html>`;
const PARENT_HTML = `<!doctype html><html><body><iframe id="preview" src="${FRAME}" style="width:1200px;height:800px"></iframe><script>
window.received = [];
window.addEventListener('message', function (event) { window.received.push(event.data); });
window.send = function (message) { document.getElementById('preview').contentWindow.postMessage(message, '*'); };
</script></body></html>`;

const instanceSchema = z.object({
  id: z.string(),
  settings: z.object({ heading: z.string().optional() }),
});
const blockSchema = z.object({ instance: instanceSchema });

let browser: Browser;
let page: Page;
const blockBodies: unknown[] = [];

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.route(`${ORIGIN}/parent`, (route) => route.fulfill({ contentType: 'text/html', body: PARENT_HTML }));
  await page.route(FRAME, (route) => route.fulfill({ contentType: 'text/html', body: FRAME_HTML }));
  await page.route(`${FRAME}/block`, async (route) => {
    const body: unknown = JSON.parse(route.request().postData() ?? '{}');
    blockBodies.push(body);
    const { instance } = blockSchema.parse(body);
    if (instance.settings.heading === 'сломать') return route.fulfill({ status: 500, body: '' });
    // Медленный ответ: на правку, которая ушла раньше, ответ приходит позже следующей.
    if (instance.settings.heading === 'медленно') await new Promise((resolve) => setTimeout(resolve, 500));
    const html = section(instance.id, instance.settings.heading ?? 'Новый');
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ html, css: '.flex{display:flex}' }) });
  });
  await page.goto(`${ORIGIN}/parent`);
});

afterAll(async () => {
  await browser.close();
});

const received = (): Promise<Message[]> => page.evaluate(() => window.received);
const lastOf = async (type: string): Promise<Message | undefined> =>
  (await received()).filter((message) => message.type === type).at(-1);
const countOf = async (type: string): Promise<number> =>
  (await received()).filter((message) => message.type === type).length;
const send = (message: unknown): Promise<void> => page.evaluate((value) => window.send(value), message);
const frame = () => page.frameLocator('#preview');

describe('скрипт превью секций', () => {
  it('ready — до init, потом тишина', async () => {
    await expect.poll(() => countOf('ready')).toBeGreaterThan(0);
    await send({ type: 'init' });
    await page.waitForTimeout(400);
    const after = await countOf('ready');
    await page.waitForTimeout(700);
    expect(await countOf('ready')).toBe(after);
  });

  it('клик по секции — select-block с её id', async () => {
    await frame().locator('[data-section-id="hero-2"] h2').click();
    await expect.poll(() => lastOf('select-block')).toEqual({ type: 'select-block', blockId: 'hero-2' });
  });

  it('выбор — рамка с названием секции и «Удалить»; «Удалить» — delete-block', async () => {
    await send({ type: 'set-labels', componentLabels: { 'shop:hero': 'Первый экран' }, subsectionItemLabels: {} });
    await send({
      type: 'set-selection',
      sectionId: 'hero-1',
      sectionType: 'shop:hero',
      subsectionParentId: null,
      subsectionIndex: null,
      cookieBanner: false,
    });
    await expect.poll(() => frame().locator('#merfy-selection [data-merfy-name]').textContent()).toBe('Первый экран');
    await frame().locator('#merfy-selection [data-merfy-delete]').click();
    await expect.poll(() => lastOf('delete-block')).toEqual({ type: 'delete-block', blockId: 'hero-1' });
  });

  it('update-block — POST preview/block с экземпляром и замена секции', async () => {
    const settings = { heading: 'Шарфы к первым холодам' };
    await send({ type: 'update-block', pageId: 'home', blockId: 'hero-1', blockType: 'shop:hero', props: { id: 'hero-1', settings } });
    await expect.poll(() => frame().locator('[data-section-id="hero-1"] h2').textContent()).toBe('Шарфы к первым холодам');
    expect(blockBodies.at(-1)).toEqual({ instance: { id: 'hero-1', section: 'shop:hero', settings } });
  });

  it('ответ на старую правку не показан: медленный ответ пришёл после быстрого — на странице быстрый', async () => {
    const edit = (heading: string) => ({
      type: 'update-block',
      pageId: 'home',
      blockId: 'hero-1',
      blockType: 'shop:hero',
      props: { id: 'hero-1', settings: { heading } },
    });
    await send(edit('медленно'));
    await send(edit('Быстро'));
    await expect.poll(() => frame().locator('[data-section-id="hero-1"] h2').textContent()).toBe('Быстро');
    await page.waitForTimeout(800);
    expect(await frame().locator('[data-section-id="hero-1"] h2').textContent()).toBe('Быстро');
  });

  it('reconcile — лишние убраны, новые запрошены, порядок как в списке; reconcile-ack', async () => {
    await send({
      type: 'reconcile',
      pageId: 'home',
      version: 7,
      blocks: [
        { id: 'hero-3', type: 'shop:hero', props: { id: 'hero-3', settings: { heading: 'Третий' } }, propsHash: 'c' },
        { id: 'hero-1', type: 'shop:hero', props: { id: 'hero-1', settings: {} }, propsHash: 'a' },
      ],
    });
    await expect.poll(() => lastOf('reconcile-ack')).toMatchObject({ type: 'reconcile-ack', version: 7, ok: true });
    const order = await frame()
      .locator('merfy-section')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-section-id')));
    expect(order).toEqual(['hero-3', 'hero-1']);
  });

  it('reconcile: ответ блока, на который ушла более новая правка, не заменяет её', async () => {
    await send({
      type: 'reconcile',
      pageId: 'home',
      version: 8,
      blocks: [
        { id: 'hero-3', type: 'shop:hero', props: { id: 'hero-3', settings: { heading: 'медленно' } }, propsHash: 'd' },
        { id: 'hero-1', type: 'shop:hero', props: { id: 'hero-1', settings: {} }, propsHash: 'a' },
      ],
    });
    const settings = { heading: 'Быстро' };
    await send({ type: 'update-block', pageId: 'home', blockId: 'hero-3', blockType: 'shop:hero', props: { id: 'hero-3', settings } });
    await expect.poll(() => lastOf('reconcile-ack')).toMatchObject({ type: 'reconcile-ack', version: 8, ok: true });
    expect(await frame().locator('[data-section-id="hero-3"] h2').textContent()).toBe('Быстро');
  });

  it('ошибка блока — render-error', async () => {
    const settings = { heading: 'сломать' };
    await send({ type: 'update-block', pageId: 'home', blockId: 'hero-1', blockType: 'shop:hero', props: { id: 'hero-1', settings } });
    await expect.poll(() => countOf('render-error')).toBeGreaterThan(0);
  });

  it('секция у верхнего края страницы — подпись внутри рамки, «Удалить» видно', async () => {
    await frame().locator('body').evaluate((body) => (body.style.paddingTop = '0'));
    await send({
      type: 'set-selection',
      sectionId: 'hero-3',
      sectionType: 'shop:hero',
      subsectionParentId: null,
      subsectionIndex: null,
      cookieBanner: false,
    });
    const gap = async (): Promise<number> => {
      const label = await frame().locator('#merfy-selection [data-merfy-label]').boundingBox();
      const section = await frame().locator('[data-section-id="hero-3"]').boundingBox();
      return label && section ? label.y - section.y : -100;
    };
    await expect.poll(gap).toBeGreaterThanOrEqual(0);
  });
});

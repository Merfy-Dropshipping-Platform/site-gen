import { chromium, type Browser, type Page } from 'playwright';
import { z } from 'zod';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PREVIEW_AGENT } from '../../src/preview-agent';
import { PREVIEW_SECTIONS_AGENT } from '../../src/preview-sections-agent';
import { emptyShopHtml } from '../../src/empty-shop';

// Reconcile пустого магазина и ack в настоящем Chromium (21.11, запись Визи в пустой магазин): заглушка «Здесь пока
// пусто» снимается, когда секции встали, и возвращается, когда их не осталось; ack — один, на последний reconcile, и
// «ok» только когда секции списка действительно на странице.
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
const SLOW_MS = 600;
const sectionHtml = (id: string, text: string): string =>
  `<merfy-section data-section="shop:hero" data-section-id="${id}" class="py-section"><h2>${text}</h2></merfy-section>`;
const FRAME_HTML =
  `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><main>${emptyShopHtml('https://mcp.dev.merfy.ru/mcp')}</main>` +
  `<script>${PREVIEW_AGENT}</script><script>${PREVIEW_SECTIONS_AGENT}</script></body></html>`;
const PARENT_HTML = `<!doctype html><html><body><iframe id="preview" src="${FRAME}" style="width:1200px;height:800px"></iframe><script>
window.received = [];
window.addEventListener('message', function (event) { window.received.push(event.data); });
window.send = function (message) { document.getElementById('preview').contentWindow.postMessage(message, '*'); };
</script></body></html>`;

const requestSchema = z.object({
  instance: z.object({ id: z.string(), settings: z.object({ heading: z.string().optional() }) }),
});

let browser: Browser;
let page: Page;
let blockRequests: string[] = [];

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.route(`${ORIGIN}/parent`, (route) => route.fulfill({ contentType: 'text/html', body: PARENT_HTML }));
  await page.route(FRAME, (route) => route.fulfill({ contentType: 'text/html', body: FRAME_HTML }));
  await page.route(`${FRAME}/block`, async (route) => {
    const { instance } = requestSchema.parse(JSON.parse(route.request().postData() ?? '{}'));
    blockRequests.push(instance.id);
    // Медленный ответ: хост успевает повторить reconcile или правка секции — раньше ответа.
    if (instance.settings.heading === 'медленно') await new Promise((resolve) => setTimeout(resolve, SLOW_MS));
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ html: sectionHtml(instance.id, instance.settings.heading ?? instance.id), css: '' }),
    });
  });
});

beforeEach(async () => {
  blockRequests = [];
  await page.goto(`${ORIGIN}/parent`);
  await frame().locator('[data-merfy-empty-shop]').waitFor();
});

afterAll(async () => {
  await browser.close();
});

const frame = () => page.frameLocator('#preview');
const send = (message: unknown): Promise<void> => page.evaluate((value) => window.send(value), message);
const acks = async (): Promise<Message[]> =>
  page.evaluate(() => window.received.filter((message) => message.type === 'reconcile-ack'));
const block = (id: string, heading = id) => ({
  id,
  type: 'shop:hero',
  props: { id, settings: { heading } },
  propsHash: `${id}:${heading}`,
});
const reconcile = (version: number, ...blocks: ReturnType<typeof block>[]) =>
  send({ type: 'reconcile', pageId: 'home', version, blocks });
const sectionIds = (): Promise<(string | null)[]> =>
  frame()
    .locator('merfy-section')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-section-id')));

describe('reconcile: заглушка пустого магазина и ack', () => {
  it('секции пришли на страницу с заглушкой — заглушка снята, секции в <main>, ack ok', async () => {
    await reconcile(1, block('hero-1'), block('hero-2'));
    await expect.poll(async () => (await acks()).length).toBe(1);
    expect((await acks())[0]).toMatchObject({ version: 1, ok: true, applied: 2 });
    expect(await frame().locator('[data-merfy-empty-shop]').count()).toBe(0);
    expect(await sectionIds()).toEqual(['hero-1', 'hero-2']);
    expect(await frame().locator('main > merfy-section').count()).toBe(2);
  });

  it('секций не осталось — заглушка возвращается; секции снова — снова снята', async () => {
    await reconcile(1, block('hero-1'));
    await expect.poll(async () => (await acks()).length).toBe(1);
    await reconcile(2);
    await expect.poll(async () => (await acks()).length).toBe(2);
    expect(await sectionIds()).toEqual([]);
    expect(await frame().locator('main [data-merfy-empty-shop]').count()).toBe(1);
    await reconcile(3, block('hero-3'));
    await expect.poll(async () => (await acks()).length).toBe(3);
    expect(await frame().locator('[data-merfy-empty-shop]').count()).toBe(0);
    expect(await sectionIds()).toEqual(['hero-3']);
    expect((await acks()).map((ack) => ack.ok)).toEqual([true, true, true]);
  });

  it('ответ блока отброшен как устаревший (правка секции в пути) — не ok: ok: false и missing, заглушка на месте', async () => {
    await reconcile(1, block('late-1', 'медленно'));
    await send({
      type: 'update-block',
      pageId: 'home',
      blockId: 'late-1',
      blockType: 'shop:hero',
      props: { id: 'late-1', settings: { heading: 'правка' } },
    });
    await expect.poll(async () => (await acks()).length).toBe(1);
    expect((await acks())[0]).toMatchObject({ version: 1, ok: false, applied: 0, missing: ['late-1'] });
    expect(await sectionIds()).toEqual([]);
    expect(await frame().locator('[data-merfy-empty-shop]').count()).toBe(1);
  });

  it('повтор того же списка до ответа (хост со сроком 2 с) не отменяет запрос в пути: один запрос, один ack — на последний reconcile', async () => {
    await reconcile(1, block('slow-1', 'медленно'));
    await reconcile(2, block('slow-1', 'медленно'));
    await reconcile(3, block('slow-1', 'медленно'));
    await expect.poll(async () => (await acks()).length).toBe(1);
    await page.waitForTimeout(300);
    expect(await acks()).toHaveLength(1);
    expect((await acks())[0]).toMatchObject({ version: 3, ok: true });
    expect(blockRequests).toEqual(['slow-1']);
    expect(await sectionIds()).toEqual(['slow-1']);
    expect(await frame().locator('[data-merfy-empty-shop]').count()).toBe(0);
  });

  it('reconcile, поверх которого пришёл новый с другим списком, молчит и ничего не ставит', async () => {
    await reconcile(1, block('old-1', 'медленно'));
    await reconcile(2, block('new-1'));
    await expect.poll(async () => (await acks()).length).toBe(1);
    await page.waitForTimeout(SLOW_MS + 200);
    expect(await acks()).toHaveLength(1);
    expect((await acks())[0]).toMatchObject({ version: 2, ok: true });
    expect(await sectionIds()).toEqual(['new-1']);
  });
});

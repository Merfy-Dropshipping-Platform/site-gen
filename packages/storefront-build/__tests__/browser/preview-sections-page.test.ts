import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PREVIEW_AGENT } from '../../src/preview-agent';
import { PREVIEW_SECTIONS_AGENT } from '../../src/preview-sections-agent';

// Страница и запись превью в запросе одного блока (блок 8 «Секций и SDK», часть 8г-2): скрипт превью читает их из
// адреса превью (?page=…&record=…) — поле с записью в правке блока получает ту же запись, что вся страница превью.
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
const FRAME_PATH = '/api/sites/s1/preview';
const sectionHtml = (title: string): string =>
  `<merfy-section data-section="shop:product" data-section-id="product-1"><h1>${title}</h1></merfy-section>`;
const FRAME_HTML =
  `<!doctype html><html><head><meta charset="utf-8"></head><body><main>${sectionHtml('Шарф')}</main>` +
  `<script>${PREVIEW_AGENT}</script><script>${PREVIEW_SECTIONS_AGENT}</script></body></html>`;
const PARENT_SCRIPT = `window.received = [];
window.addEventListener('message', function (event) { window.received.push(event.data); });
window.send = function (message) { document.getElementById('preview').contentWindow.postMessage(message, '*'); };`;
const parentHtml = (src: string): string =>
  `<!doctype html><html><head><meta charset="utf-8"></head><body><iframe id="preview" src="${src.replace(/&/g, '&amp;')}"></iframe>` +
  `<script>${PARENT_SCRIPT}</script></body></html>`;

let browser: Browser;
let page: Page;
const bodies: unknown[] = [];

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.route(
    (url) => url.pathname === `${FRAME_PATH}/block`,
    async (route) => {
      const body: unknown = JSON.parse(route.request().postData() ?? '{}');
      bodies.push(body);
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ html: sectionHtml('Плед'), css: '' }),
      });
    },
  );
  await page.route(
    (url) => url.pathname === FRAME_PATH,
    (route) => route.fulfill({ contentType: 'text/html', body: FRAME_HTML }),
  );
  await page.route(
    (url) => url.pathname === '/parent',
    (route) => {
      const src = new URL(route.request().url()).searchParams.get('src') ?? '';
      return route.fulfill({ contentType: 'text/html', body: parentHtml(src) });
    },
  );
});

afterAll(async () => {
  await browser.close();
});

const EDIT = {
  type: 'update-block',
  pageId: 'product',
  blockId: 'product-1',
  blockType: 'shop:product',
  props: { id: 'product-1', settings: { product: 'p-2' } },
};
const send = (message: unknown): Promise<void> => page.evaluate((value) => window.send(value), message);
const readyCount = (): Promise<number> =>
  page.evaluate(() => window.received.filter((message) => message.type === 'ready').length);

// Превью по адресу src: скрипт превью готов — init, правка блока; тело запроса блока.
async function editIn(src: string): Promise<unknown> {
  const before = bodies.length;
  await page.goto(`${ORIGIN}/parent?src=${encodeURIComponent(src)}`);
  await expect.poll(readyCount).toBeGreaterThan(0);
  await send({ type: 'init' });
  await send(EDIT);
  await expect.poll(() => bodies.length).toBe(before + 1);
  return bodies.at(-1);
}

describe('скрипт превью: страница и запись в запросе блока', () => {
  it('адрес превью с page и record — оба в теле запроса блока', async () => {
    expect(await editIn(`${ORIGIN}${FRAME_PATH}?page=product&record=p-2`)).toEqual({
      instance: { id: 'product-1', section: 'shop:product', settings: { product: 'p-2' } },
      page: 'product',
      record: 'p-2',
    });
  });

  it('запись адресом от корня (record=%2Fproduct%2Fsharf) — в теле адресом', async () => {
    expect(await editIn(`${ORIGIN}${FRAME_PATH}?page=product&record=%2Fproduct%2Fsharf`)).toMatchObject({
      page: 'product',
      record: '/product/sharf',
    });
  });

  it('без record — только page; без параметров — тело как раньше', async () => {
    const home = await editIn(`${ORIGIN}${FRAME_PATH}?page=home`);
    expect(home).toMatchObject({ page: 'home' });
    expect(home).not.toHaveProperty('record');
    expect(await editIn(`${ORIGIN}${FRAME_PATH}`)).toEqual({
      instance: { id: 'product-1', section: 'shop:product', settings: { product: 'p-2' } },
    });
  });
});

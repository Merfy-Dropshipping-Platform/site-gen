import { chromium, type Browser, type Frame, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PREVIEW_AGENT } from '../../src/preview-agent';
import { PREVIEW_SECTIONS_AGENT } from '../../src/preview-sections-agent';

// Значения сторов расширений в превью (сообщение ext-store-values; превью секции в кабинете расширения): запрос стора по
// записи к функции расширения по записи с присланным значением отвечает скрипт превью, а не сервер; остальные записи
// запроса идут на сервер как есть. Расширение — test-ext, стор card (by: record) с функцией itemCard.
const ORIGIN = 'http://preview.test';
const API = 'http://gateway.test';
const FRAME = `${ORIGIN}/api/sites/s1/preview?page=home`;
const STORE_URL = `${API}/api/store/extensions/test-ext/fn/itemCard?store_id=s1`;
const OTHER_URL = `${API}/api/store/extensions/test-ext/fn/other?store_id=s1`;
const CONFIG = {
  extensions: {
    'test-ext': {
      stores: {
        card: { fn: 'itemCard', by: 'record', record: 'item' },
        plain: { fn: 'other' },
        byProduct: { fn: 'other', by: 'product' },
      },
      methods: {},
    },
  },
};
const FRAME_HTML = `<!doctype html><html><head><script type="application/json" id="merfy-config">${JSON.stringify(CONFIG)}</script></head><body><main></main><script>${PREVIEW_AGENT}</script><script>${PREVIEW_SECTIONS_AGENT}</script></body></html>`;
const PARENT_HTML = `<!doctype html><html><body><iframe id="preview" src="${FRAME}" style="width:800px;height:600px"></iframe><script>
window.send = function (message) { document.getElementById('preview').contentWindow.postMessage(message, '*'); };
</script></body></html>`;

declare global {
  interface Window {
    send: (message: unknown) => void;
  }
}

interface Seen {
  url: string;
  body: unknown;
}

let browser: Browser;
let page: Page;
const seen: Seen[] = [];

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.route(`${ORIGIN}/parent`, (route) =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: PARENT_HTML }),
  );
  await page.route(FRAME, (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: FRAME_HTML }));
  await page.route(`${API}/**`, (route) => {
    const request = route.request();
    seen.push({ url: request.url(), body: JSON.parse(request.postData() ?? 'null') as unknown });
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
      body: JSON.stringify({ success: true, data: { 'r-2': { title: 'С сервера' } } }),
    });
  });
  await page.goto(`${ORIGIN}/parent`);
  await page.evaluate(() => window.send({ type: 'init' }));
});

afterAll(async () => {
  await browser.close();
});

const frame = (): Frame => {
  const found = page.frames().find((candidate) => candidate.url().startsWith(FRAME.split('?')[0] ?? FRAME));
  if (found === undefined) throw new Error('нет iframe превью');
  return found;
};

const values = (list: unknown[]) => page.evaluate((value) => window.send({ type: 'ext-store-values', values: value }), list);

/** Запрос стора из рамки, как делает ядро витрины: POST с телом { recordIds }; ответ — разобранный JSON. */
const ask = (url: string, ids: string[]) =>
  frame().evaluate(
    async ([target, recordIds]) => {
      const response = await fetch(target as string, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recordIds }),
      });
      return { status: response.status, body: (await response.json()) as unknown };
    },
    [url, ids] as const,
  );

const settle = () => page.waitForTimeout(100);

describe('значения сторов расширений в превью', () => {
  it('значений нет — запрос идёт на сервер как есть', async () => {
    seen.length = 0;
    const answer = await ask(STORE_URL, ['r-1']);
    expect(answer.body).toEqual({ success: true, data: { 'r-2': { title: 'С сервера' } } });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.body).toEqual({ recordIds: ['r-1'] });
  });

  it('запись с присланным значением — ответ скрипта превью, сервер не вызывается; статус 2xx и success: true', async () => {
    await values([{ extension: 'test-ext', store: 'card', recordId: 'r-1', value: { title: 'Из поля' } }]);
    await settle();
    seen.length = 0;
    const answer = await ask(STORE_URL, ['r-1']);
    expect(answer.status).toBe(201);
    expect(answer.body).toEqual({ success: true, data: { 'r-1': { title: 'Из поля' } } });
    expect(seen).toEqual([]);
  });

  it('новые значения заменяют прежние; пустой список снимает подмену', async () => {
    await values([{ extension: 'test-ext', store: 'card', recordId: 'r-1', value: { title: 'Новое' } }]);
    await settle();
    expect((await ask(STORE_URL, ['r-1'])).body).toEqual({ success: true, data: { 'r-1': { title: 'Новое' } } });
    await values([]);
    await settle();
    seen.length = 0;
    await ask(STORE_URL, ['r-1']);
    expect(seen).toHaveLength(1);
  });

  it('несколько записей — свои из значений, остальные с сервера, на сервер уходят только остальные', async () => {
    await values([{ extension: 'test-ext', store: 'card', recordId: 'r-1', value: { title: 'Из поля' } }]);
    await settle();
    seen.length = 0;
    const answer = await ask(STORE_URL, ['r-1', 'r-2']);
    expect(answer.body).toEqual({
      success: true,
      data: { 'r-1': { title: 'Из поля' }, 'r-2': { title: 'С сервера' } },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.body).toEqual({ recordIds: ['r-2'] });
  });

  it('стор не по записи, неизвестный стор или расширение — значение не принимается', async () => {
    await values([
      { extension: 'test-ext', store: 'plain', recordId: 'r-1', value: 1 },
      { extension: 'test-ext', store: 'byProduct', recordId: 'r-1', value: 2 },
      { extension: 'test-ext', store: 'nope', recordId: 'r-1', value: 3 },
      { extension: 'other-ext', store: 'card', recordId: 'r-1', value: 4 },
      { extension: 'test-ext', store: 'card', recordId: '', value: 5 },
    ]);
    await settle();
    seen.length = 0;
    await ask(OTHER_URL, ['r-1']);
    await ask(STORE_URL, ['r-1']);
    expect(seen).toHaveLength(2);
  });

  it('значение для одной функции не подменяет ответ другой; запрос не по форме идёт на сервер', async () => {
    await values([{ extension: 'test-ext', store: 'card', recordId: 'r-1', value: { title: 'Из поля' } }]);
    await settle();
    seen.length = 0;
    await ask(OTHER_URL, ['r-1']);
    const notRecords = await frame().evaluate(async (target) => {
      const response = await fetch(target, { method: 'POST', body: JSON.stringify({ productIds: ['r-1'] }) });
      return (await response.json()) as unknown;
    }, STORE_URL);
    expect(notRecords).toEqual({ success: true, data: { 'r-2': { title: 'С сервера' } } });
    expect(seen).toHaveLength(2);
  });
});

import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PREVIEW_LIST_EVENT } from '@merfy/shell/preview';
import { PREVIEW_AGENT } from '../../src/preview-agent';
import { PREVIEW_SECTIONS_AGENT } from '../../src/preview-sections-agent';

// Событие списка в превью (блок 11 «Секций и SDK», часть 11а-2, Р11а-20): модуль «Каталог» просит список с параметрами —
// скрипт секций превью отменяет событие и запрашивает блок с list; блок, которого он не знает, — событие не отменяется.
const ORIGIN = 'http://preview.test';
const FRAME = `${ORIGIN}/api/sites/s1/preview?page=catalog`;
const BLOCK = `${ORIGIN}/api/sites/s1/preview/block`;
const section = (id: string, text: string): string =>
  `<merfy-section data-section="shop:grid" data-section-id="${id}" class="py-section"><p>${text}</p></merfy-section>`;
const FRAME_HTML = `<!doctype html><html><head></head><body><main>${section('grid-1', 'Все товары')}${section('other-1', 'Чужой')}</main><script>${PREVIEW_AGENT}</script><script>${PREVIEW_SECTIONS_AGENT}</script></body></html>`;
const PARENT_HTML = `<!doctype html><html><body><iframe id="preview" src="${FRAME}" style="width:1200px;height:800px"></iframe><script>
window.send = function (message) { document.getElementById('preview').contentWindow.postMessage(message, '*'); };
</script></body></html>`;

declare global {
  interface Window {
    send: (message: unknown) => void;
  }
}

let browser: Browser;
let page: Page;
const bodies: unknown[] = [];

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.route(`${ORIGIN}/parent`, (route) =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: PARENT_HTML }),
  );
  await page.route(FRAME, (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: FRAME_HTML }));
  await page.route(BLOCK, (route) => {
    const body: unknown = JSON.parse(route.request().postData() ?? '{}');
    bodies.push(body);
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ html: section('grid-1', 'Отфильтровано'), css: '' }),
    });
  });
  await page.goto(`${ORIGIN}/parent`);
  await page.evaluate(() => window.send({ type: 'init' }));
  const blocks = [{ id: 'grid-1', type: 'shop:grid', props: { settings: { 'per-page': 2 } }, propsHash: 'h-1' }];
  await page.evaluate((value) => window.send({ type: 'reconcile', version: 1, blocks: value }), blocks);
});

afterAll(async () => {
  await browser.close();
});

const frame = () => page.frames().find((candidate) => candidate.url().startsWith(FRAME.split('?')[0] ?? FRAME));

async function askList(id: string, list: string): Promise<boolean> {
  const target = frame();
  if (target === undefined) throw new Error('нет iframe превью');
  return target.evaluate(
    ([name, sectionId, value]) => {
      const node = document.querySelector(`[data-section-id="${sectionId}"] p`);
      const replies: string[] = [];
      Reflect.set(window, 'listReplies', replies);
      const reply = (html: string): void => {
        replies.push(html);
      };
      const event = new CustomEvent(name, { bubbles: true, cancelable: true, detail: { list: value, reply } });
      return node === null ? false : !node.dispatchEvent(event);
    },
    [PREVIEW_LIST_EVENT, id, list] as const,
  );
}

const repliesInFrame = (): Promise<unknown> | undefined =>
  frame()?.evaluate(() => {
    const replies: unknown = Reflect.get(window, 'listReplies');
    return replies;
  });

describe('событие списка в превью', () => {
  it('известный блок: событие отменено, запрос блока с list, page и экземпляром; HTML — в reply, узел не тронут', async () => {
    expect(await askList('grid-1', 'sort=price_asc')).toBe(true);
    await expect.poll(() => bodies.length).toBe(1);
    expect(bodies[0]).toMatchObject({
      instance: { id: 'grid-1', section: 'shop:grid', settings: { 'per-page': 2 } },
      page: 'catalog',
      list: 'sort=price_asc',
    });
    await expect.poll(repliesInFrame).toEqual([section('grid-1', 'Отфильтровано')]);
    expect(await frame()?.locator('[data-section-id="grid-1"] p').textContent()).toBe('Все товары');
  });

  it('блок не из reconcile и update-block — событие не отменено, запроса нет', async () => {
    expect(await askList('other-1', 'sort=price_asc')).toBe(false);
    await page.waitForTimeout(300);
    expect(bodies).toHaveLength(1);
  });
});

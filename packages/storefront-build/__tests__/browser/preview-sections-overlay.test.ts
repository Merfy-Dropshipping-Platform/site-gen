import { OVERLAY_HIDE_EVENT, OVERLAY_SHOW_EVENT } from '@merfy/shell/preview';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PREVIEW_AGENT } from '../../src/preview-agent';
import { PREVIEW_SECTIONS_AGENT } from '../../src/preview-sections-agent';

// Окно поверх страницы в превью (01.11) в настоящем Chromium: выбор секции с data-overlay в конструкторе — ядру
// «открыть окно» (OVERLAY_SHOW_EVENT на <merfy-section>), выбор другой секции — «закрыть»; секция без data-overlay
// событий не получает; правка выбранного окна (update-block) — «открыть» снова новому узлу.
interface Message {
  type: string;
  [key: string]: unknown;
}

declare global {
  interface Window {
    received: Message[];
    send: (message: unknown) => void;
    overlayEvents: string[];
  }
}

const ORIGIN = 'http://preview.test';
const FRAME = `${ORIGIN}/api/sites/s1/preview`;
const sectionHtml = (name: string, id: string, overlay: boolean): string =>
  `<merfy-section data-section="shop:${name}" data-section-id="${id}"${overlay ? ' data-overlay hidden' : ''}><p>${name}</p></merfy-section>`;
const WATCH = `window.overlayEvents = [];
['${OVERLAY_SHOW_EVENT}', '${OVERLAY_HIDE_EVENT}'].forEach(function (name) {
  document.addEventListener(name, function (event) {
    window.overlayEvents.push(name.slice(name.lastIndexOf('-') + 1) + ':' + event.target.getAttribute('data-section-id'));
  }, true);
});`;
const FRAME_HTML =
  `<!doctype html><html><head><meta charset="utf-8"><script>${WATCH}</script></head><body style="margin:0">` +
  `<main>${sectionHtml('hero', 'hero-1', false)}</main>${sectionHtml('promo', 'promo-1', true)}${sectionHtml('chat', 'chat-1', true)}` +
  `<script>${PREVIEW_AGENT}</script><script>${PREVIEW_SECTIONS_AGENT}</script></body></html>`;
const PARENT_HTML = `<!doctype html><html><body><iframe id="preview" src="${FRAME}" style="width:1200px;height:800px"></iframe><script>
window.received = [];
window.addEventListener('message', function (event) { window.received.push(event.data); });
window.send = function (message) { document.getElementById('preview').contentWindow.postMessage(message, '*'); };
</script></body></html>`;

let browser: Browser;
let page: Page;

const send = (message: unknown): Promise<void> => page.evaluate((value) => window.send(value), message);
const ready = async (): Promise<boolean> =>
  (await page.evaluate(() => window.received)).some((message) => message.type === 'ready');
const overlayEvents = (): Promise<string[]> =>
  page.frameLocator('#preview').locator('body').evaluate(() => window.overlayEvents.splice(0));
const select = (sectionId: string | null): Promise<void> => send({ type: 'set-selection', sectionId, actions: {} });

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.route(`${ORIGIN}/parent`, (route) => route.fulfill({ contentType: 'text/html', body: PARENT_HTML }));
  await page.route(FRAME, (route) => route.fulfill({ contentType: 'text/html', body: FRAME_HTML }));
  await page.route(`${FRAME}/block`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ html: sectionHtml('promo', 'promo-1', true), css: '' }),
    }),
  );
  await page.goto(`${ORIGIN}/parent`);
  for (let attempt = 0; attempt < 200 && !(await ready()); attempt += 1) await page.waitForTimeout(50);
  await send({ type: 'init' });
});

afterAll(async () => {
  await browser?.close();
});

// Сообщения уходят в рамку через postMessage — ждём, пока события дойдут.
async function eventsAfter(action: () => Promise<void>, count: number): Promise<string[]> {
  await action();
  const seen: string[] = [];
  for (let attempt = 0; attempt < 100 && seen.length < count; attempt += 1) {
    seen.push(...(await overlayEvents()));
    if (seen.length < count) await page.waitForTimeout(20);
  }
  return seen;
}

describe('окно поверх страницы в превью', () => {
  it('выбор окна — show; другое окно — hide прежнему и show новому; секция страницы — только hide', async () => {
    expect(await eventsAfter(() => select('promo-1'), 1)).toEqual(['show:promo-1']);
    expect(await eventsAfter(() => select('chat-1'), 2)).toEqual(['hide:promo-1', 'show:chat-1']);
    expect(await eventsAfter(() => select('hero-1'), 1)).toEqual(['hide:chat-1']);
    expect(await eventsAfter(() => select(null), 0)).toEqual([]);
  });

  it('правка выбранного окна (update-block без кода) — новый узел получает show', async () => {
    await eventsAfter(() => select('promo-1'), 1);
    const update = { type: 'update-block', blockId: 'promo-1', blockType: 'shop:promo', props: { settings: {} } };
    expect(await eventsAfter(() => send(update), 1)).toEqual(['show:promo-1']);
  });
});

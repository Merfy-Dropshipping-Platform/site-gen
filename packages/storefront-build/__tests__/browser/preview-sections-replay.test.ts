import { chromium, type Browser, type Page } from 'playwright';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PREVIEW_REPLAY_EVENT, PREVIEW_STILL_ATTRIBUTE } from '@merfy/shell/preview';
import { PREVIEW_AGENT } from '../../src/preview-agent';
import { PREVIEW_SECTIONS_AGENT } from '../../src/preview-sections-agent';

// «Проиграть анимации» и запуск без анимаций в превью (этап 3 спеки анимаций): сообщение replay от конструктора —
// событие ядру на секции или на document; свежий узел на месте прежнего несёт метку, пока ядро его запускает.
interface Message {
  type: string;
  [key: string]: unknown;
}

declare global {
  interface Window {
    received: Message[];
    send: (message: unknown) => void;
    replays: string[];
    connected: string[];
    revisions: string[];
  }
}

const ORIGIN = 'http://preview.test';
const FRAME = `${ORIGIN}/api/sites/s1/preview`;
const sectionHtml = (id: string, text = id): string =>
  `<merfy-section data-section="shop:hero" data-section-id="${id}"><p>${text}</p></merfy-section>`;
// Ядра в рамке нет: вместо него <merfy-section> пишет в журнал, была ли метка при подключении, а документ — события replay.
const FRAME_HTML =
  `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><main>${sectionHtml('hero-1')}${sectionHtml('hero-2')}</main>` +
  `<script>window.replays = []; window.connected = []; window.revisions = [];
  document.addEventListener('merfy:preview:update', function (event) {
    window.revisions.push(event.target.getAttribute('data-section-id') + ':' + event.detail.revision);
  });
  customElements.define('merfy-section', class extends HTMLElement {
    connectedCallback() { window.connected.push(this.getAttribute('data-section-id') + ':' + this.hasAttribute(${JSON.stringify(PREVIEW_STILL_ATTRIBUTE)})); }
  });
  document.addEventListener(${JSON.stringify(PREVIEW_REPLAY_EVENT)}, function (event) {
    var target = event.target;
    window.replays.push(target === document ? 'document' : target.getAttribute('data-section-id'));
  });</script>` +
  `<script>${PREVIEW_AGENT}</script><script>${PREVIEW_SECTIONS_AGENT}</script></body></html>`;
const PARENT_HTML = `<!doctype html><html><body><iframe id="preview" src="${FRAME}" style="width:1200px;height:800px"></iframe><script>
window.received = [];
window.addEventListener('message', function (event) { window.received.push(event.data); });
window.send = function (message) { document.getElementById('preview').contentWindow.postMessage(message, '*'); };
</script></body></html>`;

let browser: Browser;
let page: Page;
const requestSchema = z.object({ instance: z.object({ id: z.string() }) });

const send = (message: unknown): Promise<void> => page.evaluate((value) => window.send(value), message);
const inFrame = <T>(work: () => T): Promise<T> => {
  const handle = page.frames().find((item) => item.url().startsWith(FRAME));
  if (handle === undefined) throw new Error('нет рамки превью');
  return handle.evaluate(work);
};
const block = (id: string, propsHash: string) => ({ id, type: 'shop:hero', props: { id, settings: {} }, propsHash });

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.route(`${ORIGIN}/parent`, (route) => route.fulfill({ contentType: 'text/html', body: PARENT_HTML }));
  await page.route(FRAME, (route) => route.fulfill({ contentType: 'text/html', body: FRAME_HTML }));
  await page.route(`${FRAME}/block`, (route) => {
    const body = requestSchema.parse(JSON.parse(route.request().postData() ?? '{}'));
    const html = sectionHtml(body.instance.id, 'Новый текст');
    const revision = `rev-${body.instance.id}`;
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ html, css: '', script: null, revision }),
    });
  });
  await page.goto(`${ORIGIN}/parent`);
  await page.waitForFunction(() => window.received.length > 0);
  await send({ type: 'init' });
});

afterAll(async () => {
  await browser.close();
});

describe('replay и метка запуска без анимаций', () => {
  it('replay с sectionId — событие на этой секции; без — на document; чужой id — ничего', async () => {
    await send({ type: 'replay', sectionId: 'hero-2' });
    await send({ type: 'replay', sectionId: null });
    await send({ type: 'replay', sectionId: 'нет-такой' });
    await expect
      .poll(() => inFrame(() => window.replays))
      .toEqual(['hero-2', 'document']);
  });

  it('reconcile: узел на месте прежнего подключается с меткой и теряет её; новая секция — без метки', async () => {
    // Первый reconcile запоминает hash известных блоков без перезапроса; правка — второй.
    await send({ type: 'reconcile', version: 1, blocks: [block('hero-1', 'a'), block('hero-2', 'b')] });
    await expect.poll(async () => page.evaluate(() => window.received.length)).toBeGreaterThan(1);
    await send({
      type: 'reconcile',
      version: 2,
      blocks: [block('hero-1', 'новый'), block('hero-2', 'b'), block('hero-3', 'c')],
    });
    await expect.poll(() => inFrame(() => window.connected)).toContain('hero-3:false');
    const connected = await inFrame(() => window.connected);
    expect(connected).toContain('hero-1:true');
    expect(connected).not.toContain('hero-2:true');
    // Ревизия кода из ответа блока доходит до скрипта превью вместе с правкой.
    expect(await inFrame(() => window.revisions)).toEqual(expect.arrayContaining(['hero-1:rev-hero-1']));
    expect(await inFrame(() => document.querySelectorAll('[data-merfy-still]').length)).toBe(0);
  });
});

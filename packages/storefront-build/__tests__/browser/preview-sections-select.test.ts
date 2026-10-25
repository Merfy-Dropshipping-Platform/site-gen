import { BLOCK_DESELECT_EVENT, BLOCK_SELECT_EVENT, PREVIEW_UPDATED_EVENT } from '@merfy/shell/preview';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PREVIEW_AGENT } from '../../src/preview-agent';
import { PREVIEW_SECTIONS_AGENT } from '../../src/preview-sections-agent';

// Выбор блока в превью (блок 6 «Секций и SDK», часть 6в; В6-1 А) в настоящем Chromium: set-selection с подпунктом —
// «выбран блок» на первом узле блока, другой блок или снятие выбора — сначала «выбор снят» прежнему; после замены
// секции с выбранным блоком — «выбран блок» ещё раз. Ядра здесь нет: события пишет в window.blockEvents слушатель
// на document.
interface Message {
  type: string;
  [key: string]: unknown;
}

interface BlockEvent {
  readonly name: string;
  readonly blockId: unknown;
  readonly on: string; // тег и data-merfy-block узла, на котором событие
}

declare global {
  interface Window {
    received: Message[];
    send: (message: unknown) => void;
  }
}

const ORIGIN = 'http://preview.test';
const FRAME = `${ORIGIN}/api/sites/s1/preview`;
const slides =
  '<merfy-section data-section="shop:slideshow" data-section-id="hero" class="py-section"><div>' +
  '<div data-merfy-block="slide-1"><p>Шарфы к первым холодам</p></div>' +
  '<div data-merfy-block="slide-2"><p>Кашемир</p></div><button type="button" data-merfy-block="slide-2">2</button>' +
  '</div></merfy-section>';
const LISTENER =
  'window.blockEvents = [];' +
  `[${JSON.stringify(BLOCK_SELECT_EVENT)}, ${JSON.stringify(BLOCK_DESELECT_EVENT)}].forEach(function (name) {` +
  ' document.addEventListener(name, function (event) {' +
  " var on = event.target.localName + ' ' + event.target.getAttribute('data-merfy-block');" +
  ' window.blockEvents.push({ name: event.type, blockId: event.detail.blockId, on: on }); }); });';
const FRAME_HTML = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;padding-top:60px"><main>${slides}<merfy-section data-section="shop:hero" data-section-id="text-1" class="py-section"><h2>Текст</h2></merfy-section></main><script>${PREVIEW_AGENT}</script><script>${PREVIEW_SECTIONS_AGENT}</script><script>${LISTENER}</script></body></html>`;
const PARENT_HTML = `<!doctype html><html><head><meta charset="utf-8"></head><body><iframe id="preview" src="${FRAME}" style="width:1200px;height:800px"></iframe><script>
window.received = [];
window.addEventListener('message', function (event) { window.received.push(event.data); });
window.send = function (message) { document.getElementById('preview').contentWindow.postMessage(message, '*'); };
</script></body></html>`;

let browser: Browser;
let page: Page;

const countOf = async (type: string): Promise<number> =>
  (await page.evaluate(() => window.received)).filter((message) => message.type === type).length;
const send = (message: unknown): Promise<void> => page.evaluate((value) => window.send(value), message);
const frame = () => page.frameLocator('#preview');
const events = (): Promise<unknown> =>
  frame()
    .locator('body')
    .evaluate((): unknown => Reflect.get(window, 'blockEvents'));
const clear = (): Promise<void> =>
  frame()
    .locator('body')
    .evaluate(() => void Reflect.set(window, 'blockEvents', []));
const choose = (index: number | null, sectionId = 'hero'): Promise<void> =>
  send({
    type: 'set-selection',
    sectionId,
    ...(index === null ? {} : { subsectionParentId: sectionId, subsectionIndex: index }),
  });
const updated = (id: string): Promise<void> =>
  frame()
    .locator('body')
    .evaluate(
      (_body, value) => {
        document.dispatchEvent(
          new CustomEvent(value.name, { detail: { id: value.id, outcome: 'fresh', message: '' } }),
        );
      },
      { name: PREVIEW_UPDATED_EVENT, id },
    );
// Событие на первом узле блока — <div>, не на кнопке с тем же data-merfy-block.
const select = (blockId: string): BlockEvent => ({ name: BLOCK_SELECT_EVENT, blockId, on: `div ${blockId}` });
const deselect = (blockId: string): BlockEvent => ({ name: BLOCK_DESELECT_EVENT, blockId, on: `div ${blockId}` });

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.route(`${ORIGIN}/parent`, (route) => route.fulfill({ contentType: 'text/html', body: PARENT_HTML }));
  await page.route(FRAME, (route) => route.fulfill({ contentType: 'text/html', body: FRAME_HTML }));
  await page.goto(`${ORIGIN}/parent`);
  // expect.poll вне теста vitest не позволяет — тот же опрос циклом.
  for (let attempt = 0; attempt < 200 && (await countOf('ready')) === 0; attempt++) await page.waitForTimeout(50);
  await send({ type: 'init' });
});

afterAll(async () => {
  await browser.close();
});

describe('выбор блока в превью — события для кода секции', () => {
  it('подпункт выбран — «выбран блок» на первом узле блока с его id; тот же выбор ещё раз — ничего', async () => {
    await choose(1);
    await expect.poll(events).toEqual([select('slide-2')]);
    await choose(1);
    await page.waitForTimeout(200);
    expect(await events()).toEqual([select('slide-2')]);
  });

  it('другой блок — сначала «выбор снят» прежнему; выбрана секция без подпункта — только «выбор снят»', async () => {
    await clear();
    await choose(0);
    await expect.poll(events).toEqual([deselect('slide-2'), select('slide-1')]);
    await choose(null);
    await expect.poll(events).toEqual([deselect('slide-2'), select('slide-1'), deselect('slide-1')]);
    await choose(null, 'text-1');
    await page.waitForTimeout(200);
    expect(await events()).toHaveLength(3);
  });

  it('замена секции с выбранным блоком — «выбран блок» ещё раз; замена другой секции — ничего', async () => {
    await choose(1);
    await expect.poll(events).toHaveLength(4);
    await clear();
    await updated('text-1');
    await updated('hero');
    await expect.poll(events).toEqual([select('slide-2')]);
  });
});

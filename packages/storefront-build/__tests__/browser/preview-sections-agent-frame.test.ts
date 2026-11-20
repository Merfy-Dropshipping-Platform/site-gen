import { chromium, type Browser, type Page } from 'playwright';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PREVIEW_AGENT } from '../../src/preview-agent';
import { PREVIEW_SECTIONS_AGENT } from '../../src/preview-sections-agent';

// Рамка Визи в превью (этап 4 «Живой холст», Ч5) в настоящем Chromium: сообщение set-agent-frame { sectionId, label? } —
// фиолетовая рамка #merfy-agent-frame с подписью «Визи · <label>» без кнопок; выбор мерчанта и панель не трогает;
// секция за краем окна — прокрутка; рамка идёт за секцией (scroll, замена update-block); sectionId: null — рамки нет.
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
// Высота секций задана — страница длинная: «далёкая» секция лежит за краем окна 800 px.
const HEIGHT = 400;
const section = (id: string, text: string): string =>
  `<merfy-section data-section="shop:hero" data-section-id="${id}" class="py-section" style="display:block;height:${HEIGHT}px"><h2>${text}</h2></merfy-section>`;
const FRAME_HTML = `<!doctype html><html><head></head><body style="margin:0;padding-top:60px"><main>${section('near-1', 'Первый')}${section('near-2', 'Второй')}${section('gap-1', 'Промежуток')}${section('gap-2', 'Промежуток')}${section('far-1', 'Далёкий')}</main><script>${PREVIEW_AGENT}</script><script>${PREVIEW_SECTIONS_AGENT}</script></body></html>`;
const PARENT_HTML = `<!doctype html><html><body><iframe id="preview" src="${FRAME}" style="width:1200px;height:800px"></iframe><script>
window.received = [];
window.addEventListener('message', function (event) { window.received.push(event.data); });
window.send = function (message) { document.getElementById('preview').contentWindow.postMessage(message, '*'); };
</script></body></html>`;

const blockSchema = z.object({ instance: z.object({ id: z.string() }) });

let browser: Browser;
let page: Page;

const received = (): Promise<Message[]> => page.evaluate(() => window.received);
const countOf = async (type: string): Promise<number> =>
  (await received()).filter((message) => message.type === type).length;
const send = (message: unknown): Promise<void> => page.evaluate((value) => window.send(value), message);
const frame = () => page.frameLocator('#preview');
const agentFrame = () => frame().locator('#merfy-agent-frame');
const agentLabel = () => frame().locator('#merfy-agent-frame [data-merfy-agent-label]');
const scrollY = (): Promise<number> =>
  frame()
    .locator('body')
    .evaluate(() => window.scrollY);
const mark = (sectionId: string | null, label?: string): Promise<void> =>
  send({ type: 'set-agent-frame', sectionId, ...(label === undefined ? {} : { label }) });
// Расстояние между рамкой Визи и секцией по вертикали и горизонтали (в окне): рамка обводит секцию на 2 px снаружи.
const offsetFrom = async (sectionId: string): Promise<{ x: number; y: number } | null> => {
  const box = await agentFrame().boundingBox();
  const target = await frame().locator(`[data-section-id="${sectionId}"]`).boundingBox();
  return box && target ? { x: Math.round(box.x - target.x), y: Math.round(box.y - target.y) } : null;
};

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.route(`${ORIGIN}/parent`, (route) => route.fulfill({ contentType: 'text/html', body: PARENT_HTML }));
  await page.route(FRAME, (route) => route.fulfill({ contentType: 'text/html', body: FRAME_HTML }));
  await page.route(`${FRAME}/block`, async (route) => {
    const { instance } = blockSchema.parse(JSON.parse(route.request().postData() ?? '{}'));
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ html: section(instance.id, 'Заменён'), css: '' }),
    });
  });
  await page.goto(`${ORIGIN}/parent`);
  // expect.poll вне теста vitest не позволяет — тот же опрос циклом.
  for (let attempt = 0; attempt < 200 && (await countOf('ready')) === 0; attempt++) await page.waitForTimeout(50);
  await send({ type: 'init' });
  await send({ type: 'set-labels', componentLabels: { 'shop:hero': 'Первый экран' }, subsectionItemLabels: {} });
});

afterAll(async () => {
  await browser.close();
});

describe('рамка Визи в превью (set-agent-frame)', () => {
  it('до сообщения рамки нет; после — фиолетовая, вокруг секции, с подписью «Визи · <label>» и без кнопок', async () => {
    expect(await agentFrame().count()).toBe(0);
    await mark('near-2', 'Баннер');
    await expect.poll(() => agentLabel().textContent()).toBe('Визи · Баннер');
    expect(await agentFrame().evaluate((node) => getComputedStyle(node).borderTopColor)).toBe('rgb(91, 69, 224)');
    expect(await agentFrame().locator('button').count()).toBe(0);
    expect(await offsetFrom('near-2')).toEqual({ x: 0, y: 0 });
    const box = await agentFrame().boundingBox();
    expect(Math.round(box?.height ?? 0)).toBe(HEIGHT);
  });

  it('подпись без label — название секции из set-labels; ни label, ни названия — просто «Визи»', async () => {
    await mark('near-2');
    await expect.poll(() => agentLabel().textContent()).toBe('Визи · Первый экран');
    await send({ type: 'set-labels', componentLabels: {}, subsectionItemLabels: {} });
    await frame()
      .locator('[data-section-id="near-2"]')
      .evaluate((node) => node.removeAttribute('data-section'));
    await send({ type: 'set-labels', componentLabels: {}, subsectionItemLabels: {} });
    await expect.poll(() => agentLabel().textContent()).toBe('Визи');
    await frame()
      .locator('[data-section-id="near-2"]')
      .evaluate((node) => node.setAttribute('data-section', 'shop:hero'));
    await send({ type: 'set-labels', componentLabels: { 'shop:hero': 'Первый экран' }, subsectionItemLabels: {} });
  });

  it('выбор мерчанта не трогает: рамка выбора на своей секции, панель не открывается (select-block не уходит)', async () => {
    await send({ type: 'set-selection', sectionId: 'near-1', sectionType: 'shop:hero', cookieBanner: false });
    await expect.poll(() => frame().locator('#merfy-selection [data-merfy-name]').textContent()).toBe('Первый экран');
    await mark('near-2', 'Баннер');
    await expect.poll(() => agentLabel().textContent()).toBe('Визи · Баннер');
    const selection = await frame().locator('#merfy-selection').boundingBox();
    const first = await frame().locator('[data-section-id="near-1"]').boundingBox();
    expect(Math.round((selection?.y ?? 0) - (first?.y ?? 0))).toBe(0);
    expect(await frame().locator('#merfy-selection [data-merfy-delete]').isVisible()).toBe(true);
    expect(await countOf('select-block')).toBe(0);
    // Снять рамку Визи — выбор остался.
    await mark(null);
    await expect.poll(() => agentFrame().isVisible()).toBe(false);
    expect(await frame().locator('#merfy-selection').isVisible()).toBe(true);
  });

  it('цель на виду — страница стоит; цель за краем окна — прокрутка к ней', async () => {
    await frame()
      .locator('body')
      .evaluate(() => window.scrollTo(0, 0));
    await mark('near-1', 'Баннер');
    await expect.poll(() => agentFrame().isVisible()).toBe(true);
    await page.waitForTimeout(150);
    expect(await scrollY()).toBe(0);
    await mark('far-1', 'Далёкий');
    await expect.poll(scrollY).toBeGreaterThan(0);
    await expect.poll(() => frame().locator('[data-section-id="far-1"]').isVisible()).toBe(true);
    await expect.poll(() => offsetFrom('far-1')).toEqual({ x: 0, y: 0 });
  });

  it('рамка идёт за секцией: прокрутка страницы и смена размера окна', async () => {
    await frame()
      .locator('body')
      .evaluate(() => window.scrollBy(0, -150));
    await expect.poll(() => offsetFrom('far-1')).toEqual({ x: 0, y: 0 });
    await page.setViewportSize({ width: 900, height: 700 });
    await expect.poll(() => offsetFrom('far-1')).toEqual({ x: 0, y: 0 });
  });

  it('переживает update-block своей секции: секция заменена, рамка на новой', async () => {
    await send({
      type: 'update-block',
      pageId: 'home',
      blockId: 'far-1',
      blockType: 'shop:hero',
      props: { id: 'far-1', settings: {} },
    });
    await expect.poll(() => frame().locator('[data-section-id="far-1"] h2').textContent()).toBe('Заменён');
    await expect.poll(() => agentFrame().isVisible()).toBe(true);
    await expect.poll(() => offsetFrom('far-1')).toEqual({ x: 0, y: 0 });
    expect(await agentLabel().textContent()).toBe('Визи · Далёкий');
  });

  it('цели ещё нет на странице — рамки не видно; секция встала (reconcile) — рамка и прокрутка к ней', async () => {
    await frame()
      .locator('body')
      .evaluate(() => window.scrollTo(0, 0));
    await mark('new-1', 'Новый');
    await page.waitForTimeout(150);
    expect(await agentFrame().isVisible()).toBe(false);
    await frame()
      .locator('main')
      .evaluate((main, html) => main.insertAdjacentHTML('beforeend', html), section('new-1', 'Новый'));
    // Рамка пересчитывается там же, где рамка выбора: после замены секции (merfy:preview:updated).
    await frame()
      .locator('body')
      .evaluate(() => document.dispatchEvent(new CustomEvent('merfy:preview:updated', { detail: { id: 'new-1' } })));
    await expect.poll(() => agentFrame().isVisible()).toBe(true);
    await expect.poll(scrollY).toBeGreaterThan(0);
    await expect.poll(() => offsetFrom('new-1')).toEqual({ x: 0, y: 0 });
  });

  it('sectionId: null — рамки нет; пустая строка и неизвестная секция — тоже; незнакомый тип сообщения молча пропущен', async () => {
    await mark(null);
    await expect.poll(() => agentFrame().isVisible()).toBe(false);
    await mark('near-1', 'Баннер');
    await expect.poll(() => agentFrame().isVisible()).toBe(true);
    await send({ type: 'set-agent-frame', sectionId: '' });
    await expect.poll(() => agentFrame().isVisible()).toBe(false);
    await mark('нет-такой', 'Баннер');
    await page.waitForTimeout(150);
    expect(await agentFrame().isVisible()).toBe(false);
    await send({ type: 'constructor' });
    await send({ type: 'hasOwnProperty' });
    await mark('near-1');
    await expect.poll(() => agentFrame().isVisible()).toBe(true);
  });
});

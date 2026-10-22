import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PREVIEW_AGENT } from '../../src/preview-agent';
import { PREVIEW_SECTIONS_AGENT } from '../../src/preview-sections-agent';

// Подпункты в превью (блок 1 «Секций и SDK», часть 3, Р59, Р60) в настоящем Chromium: клик — select-subsection,
// выбранный — рамка #88b0da, наведение на секцию — #cfdff0 у всех её подпунктов; blocks — в POST preview/block.
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
const faq = (id: string): string =>
  `<merfy-section data-section="shop:faq" data-section-id="${id}" class="py-section"><div>` +
  '<details data-merfy-block="question-1" open><summary>Как стирать?</summary><div><a href="/catalog">Каталог</a></div></details>' +
  '<details data-merfy-block="question-k3f9x2a1"><summary>Доставка?</summary><div>Два дня</div></details>' +
  '</div></merfy-section>';
const FRAME_HTML = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;padding-top:60px"><main>${faq('faq-1')}<merfy-section data-section="shop:hero" data-section-id="hero-1" class="py-section"><h2>Первый</h2></merfy-section></main><script>${PREVIEW_AGENT}</script><script>${PREVIEW_SECTIONS_AGENT}</script></body></html>`;
const PARENT_HTML = `<!doctype html><html><head><meta charset="utf-8"></head><body><iframe id="preview" src="${FRAME}" style="width:1200px;height:800px"></iframe><script>
window.received = [];
window.addEventListener('message', function (event) { window.received.push(event.data); });
window.send = function (message) { document.getElementById('preview').contentWindow.postMessage(message, '*'); };
</script></body></html>`;

let browser: Browser;
let page: Page;
const bodies: unknown[] = [];

const received = (): Promise<Message[]> => page.evaluate(() => window.received);
const lastOf = async (type: string): Promise<Message | undefined> =>
  (await received()).filter((message) => message.type === type).at(-1);
const countOf = async (type: string): Promise<number> =>
  (await received()).filter((message) => message.type === type).length;
const send = (message: unknown): Promise<void> => page.evaluate((value) => window.send(value), message);
const frame = () => page.frameLocator('#preview');
const outlineOf = (id: string): Promise<string> =>
  frame()
    .locator(`[data-merfy-block="${id}"]`)
    .evaluate((node) => getComputedStyle(node).outlineColor);

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.route(`${ORIGIN}/parent`, (route) => route.fulfill({ contentType: 'text/html', body: PARENT_HTML }));
  await page.route(FRAME, (route) => route.fulfill({ contentType: 'text/html', body: FRAME_HTML }));
  await page.route(`${FRAME}/block`, (route) => {
    bodies.push(JSON.parse(route.request().postData() ?? '{}'));
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ html: faq('faq-1'), css: '' }) });
  });
  await page.goto(`${ORIGIN}/parent`);
  // expect.poll вне теста vitest не позволяет — тот же опрос циклом.
  for (let attempt = 0; attempt < 200 && (await countOf('ready')) === 0; attempt++) await page.waitForTimeout(50);
  await send({ type: 'init' });
});

afterAll(async () => {
  await browser.close();
});

describe('подпункты в превью', () => {
  it('клик по подпункту — select-subsection с местом среди блоков секции; выбора секции нет; <details> раскрывается', async () => {
    const selects = await countOf('select-block');
    await frame().getByText('Доставка?').click();
    await expect
      .poll(() => lastOf('select-subsection'))
      .toEqual({ type: 'select-subsection', parentId: 'faq-1', index: 1, field: null });
    expect(await countOf('select-block')).toBe(selects);
    await expect
      .poll(() =>
        frame()
          .locator('[data-merfy-block="question-k3f9x2a1"]')
          .evaluate((node) => node.hasAttribute('open')),
      )
      .toBe(true);
  });

  it('ссылка внутри подпункта превью не уводит', async () => {
    await frame().getByText('Каталог').click();
    await expect.poll(() => lastOf('select-subsection')).toMatchObject({ index: 0 });
    expect(await frame().locator('[data-section-id="faq-1"]').count()).toBe(1);
  });

  it('set-selection с подпунктом — рамка #88b0da только у него; без подпункта — рамки нет', async () => {
    await send({
      type: 'set-selection',
      sectionId: 'faq-1',
      sectionType: 'shop:faq',
      subsectionParentId: 'faq-1',
      subsectionIndex: 1,
      cookieBanner: false,
    });
    await expect.poll(() => outlineOf('question-k3f9x2a1')).toBe('rgb(136, 176, 218)');
    expect(await frame().locator('[data-merfy-block-selected]').count()).toBe(1);
    await send({
      type: 'set-selection',
      sectionId: 'faq-1',
      sectionType: 'shop:faq',
      subsectionParentId: null,
      subsectionIndex: null,
      cookieBanner: false,
    });
    await expect.poll(() => frame().locator('[data-merfy-block-selected]').count()).toBe(0);
  });

  it('наведение на секцию — подсветка #cfdff0 у всех её подпунктов', async () => {
    await frame().locator('[data-section-id="hero-1"] h2').hover();
    await frame().locator('[data-section-id="faq-1"] summary').first().hover();
    await expect.poll(() => frame().locator('[data-merfy-block-hint]').count()).toBe(2);
    expect(await outlineOf('question-1')).toBe('rgb(207, 223, 240)');
  });

  it('update-block: blocks из props — в запросе; без blocks — ключа нет; рамка подпункта — после замены секции', async () => {
    await send({
      type: 'set-selection',
      sectionId: 'faq-1',
      sectionType: 'shop:faq',
      subsectionParentId: 'faq-1',
      subsectionIndex: 0,
      cookieBanner: false,
    });
    const blocks = [{ id: 'question-1', type: 'question', settings: {}, hidden: true }];
    await send({
      type: 'update-block',
      blockId: 'faq-1',
      blockType: 'shop:faq',
      props: { id: 'faq-1', settings: {}, blocks },
    });
    await send({ type: 'update-block', blockId: 'faq-1', blockType: 'shop:faq', props: { id: 'faq-1', settings: {} } });
    await expect.poll(() => bodies.length).toBe(2);
    expect(bodies).toEqual([
      { instance: { id: 'faq-1', section: 'shop:faq', settings: {}, blocks } },
      { instance: { id: 'faq-1', section: 'shop:faq', settings: {} } },
    ]);
    await expect.poll(() => outlineOf('question-1')).toBe('rgb(136, 176, 218)');
  });
});

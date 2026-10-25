import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BLOCK_DESELECT_EVENT, BLOCK_SELECT_EVENT, PREVIEW_REPLACE_EVENT } from '../../src/core/preview-protocol';
import { openPage, type PageOptions } from './behaviors-support';

// Превью конструктора и поведения в Chromium (блок 6 «Секций и SDK», часть 6в; design.md блока 6, «Как проверяем»,
// п. 2): три замены подряд — номер слайда на месте, смена раз в новый интервал, не чаще; события выбора блока получает
// секция, наш слайдер на них не отвечает (В6-1 А).
const COUNT = 5;
const slides = Array.from(
  { length: COUNT },
  (_, i) =>
    `<div data-part="slide" data-merfy-block="slide-${i + 1}" style="flex:0 0 100%;height:200px"><p>Слайд ${i + 1}</p></div>`,
).join('');
const dots = Array.from(
  { length: COUNT },
  (_, i) => `<button data-part="dot" id="dot-${i + 1}">${i + 1}</button>`,
).join('');

// «Слайд-шоу» с интервалом автопрокрутки в секундах (0 — без автопрокрутки) и подписью — HTML экземпляра, как его
// отдаёт /preview/section.
const slideshow = (interval: number, caption: string): string =>
  `<merfy-section data-section="shop:slideshow" data-section-id="hero" style="display:block">
  <div data-behavior="carousel" id="root"${interval > 0 ? ` data-autoplay="${interval}"` : ''}>
    <div data-part="viewport" style="overflow:hidden;width:600px"><div data-part="container" style="display:flex">${slides}</div></div>
    ${dots}<span data-part="counter" id="counter"></span><p id="caption">${caption}</p>
  </div>
</merfy-section>`;

// Модуль секции: события выбора блока — в журнал страницы.
const LISTENER = `export default {
  mount(el, ctx) {
    window.__blocks = [];
    ctx.listen('merfy:block:select', (detail) => window.__blocks.push('select ' + detail.blockId));
    ctx.listen('merfy:block:deselect', (detail) => window.__blocks.push('deselect ' + detail.blockId));
  },
};`;

declare global {
  interface Window {
    __blocks?: string[];
  }
}

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

const open = (body: string, extra: Partial<PageOptions> = {}) =>
  openPage(browser, { body, behaviors: ['carousel'], mode: 'preview', preview: true, ...extra });
const counter = (page: Page) => page.textContent('#counter');
const waitCounter = (page: Page, value: string, timeout = 2000) =>
  page.waitForFunction((v) => document.getElementById('counter')?.textContent === v, value, { timeout });

// Замена секции — как её отправляет скрипт превью: секция без кода; итог ядра или not-handled.
const replaceSection = (page: Page, html: string): Promise<string> =>
  page.evaluate(
    ([name, markup]) =>
      new Promise<string>((resolve) => {
        const detail = {
          html: markup,
          script: null,
          codeOnly: false,
          load: () => Promise.reject(new Error('кода нет')),
          reply: (outcome: string) => resolve(outcome),
        };
        const event = new CustomEvent(name, { bubbles: true, cancelable: true, detail });
        if (document.querySelector('merfy-section')?.dispatchEvent(event) !== false) resolve('not-handled');
      }),
    [PREVIEW_REPLACE_EVENT, html] as const,
  );

const sendBlock = (page: Page, name: string, blockId: string): Promise<void> =>
  page.evaluate(
    ([event, id]) => {
      const node = document.querySelector(`[data-merfy-block="${id}"]`);
      node?.dispatchEvent(new CustomEvent(event, { bubbles: true, detail: { blockId: id } }));
    },
    [name, blockId] as const,
  );

describe('превью: поведения при замене секции и выборе блока', () => {
  it('три замены подряд: слайд на месте, смена раз в 3 с ± 0,2 с, без ошибок', async () => {
    const { page, errors } = await open(slideshow(5, 'Шарфы к первым холодам'));
    await page.click('#dot-3');
    await waitCounter(page, '3');
    for (const caption of ['Кашемир', 'Кашемир и шерсть', 'Кашемир, шерсть, шёлк'])
      expect(await replaceSection(page, slideshow(3, caption))).toBe('fresh');
    expect(await counter(page)).toBe('3');
    expect(await page.textContent('#caption')).toBe('Кашемир, шерсть, шёлк');
    await waitCounter(page, '4', 4000);
    const fourth = Date.now();
    await waitCounter(page, '5', 4000);
    expect(Math.abs(Date.now() - fourth - 3000)).toBeLessThanOrEqual(200);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('выбор блока и снятие: секция получает оба события с id блока, слайдер на месте', async () => {
    const { page, errors } = await open(slideshow(0, 'Шарфы'), {
      sections: [{ name: 'shop:slideshow', code: LISTENER }],
    });
    await sendBlock(page, BLOCK_SELECT_EVENT, 'slide-2');
    await sendBlock(page, BLOCK_DESELECT_EVENT, 'slide-2');
    expect(await page.evaluate(() => window.__blocks)).toEqual(['select slide-2', 'deselect slide-2']);
    await page.waitForTimeout(300);
    expect(await counter(page)).toBe('1');
    expect(errors).toEqual([]);
    await page.close();
  });
});

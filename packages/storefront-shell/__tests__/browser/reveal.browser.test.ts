import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { animations, curve, openPage, type PageOptions } from './behaviors-support';

// Появления data-animate в Chromium (design.md блока 6, раздел 9): пресеты «один в один», пачки, буквы, чётность
// секций, выключатели и запасной CSS при сбое ядра.
const BODY = `<main>
  <merfy-section data-section="shop:a" data-section-id="a" id="a" data-animate="appear-side" style="display:block;height:300px">
    <h2 data-animate="appear" id="top">Видно сразу</h2>
    <p data-animate="load-1" id="l1">1</p><p data-animate="load-2" id="l2">2</p><p data-animate="load-3" id="l3">3</p>
  </merfy-section>
  <div style="height:1500px"></div>
  <merfy-section data-section="shop:b" data-section-id="b" id="b" style="display:block;height:600px">
    <h2 data-animate="appear" id="below1">Ниже экрана</h2><h3 data-animate="appear" id="below2">Тоже</h3>
    <ul data-animate="appear-group" id="group"><li>1</li><li>2</li><li>3</li></ul>
    <p data-animate="letters" id="letters">Шарф</p>
    <p data-animate="fade-up" data-delay="200" id="delayed">Текст</p>
  </merfy-section>
  <merfy-section data-section="shop:c" data-section-id="c" id="side2" data-animate="appear-side" style="display:block;height:300px">2</merfy-section>
  <merfy-section data-section="shop:d" data-section-id="d" id="side3" data-animate="appear-side" style="display:block;height:300px">3</merfy-section>
  <div style="height:1500px"></div>
</main>`;

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

const open = (extra: Partial<PageOptions> = {}) =>
  openPage(browser, { body: BODY, reveal: true, motionReveal: true, headScript: true, ...extra });
const opacity = (page: Page, selector: string) => page.$eval(selector, (el) => getComputedStyle(el).opacity);
const scrollTo = async (page: Page, id: string, watch: string): Promise<void> => {
  await page.evaluate((target) => document.getElementById(target)?.scrollIntoView(), id);
  await page.waitForFunction((selector) => (document.querySelector(selector)?.getAnimations().length ?? 0) > 0, watch);
};

describe('появления', () => {
  it('видимый при старте appear — сразу: 600 мс power2.out, снизу 24 px; appear-side видимой секции — без анимации', async () => {
    const { page, errors } = await open();
    await page.waitForFunction(() => (document.getElementById('top')?.getAnimations().length ?? 0) > 0);
    const [top] = await animations(page, '#top');
    expect(top).toMatchObject({ duration: 600, delay: 0, first: { opacity: '0', transform: 'translate(0px, 24px)' } });
    expect(top?.easing).toEqual(curve('power2.out'));
    expect(await animations(page, '#a')).toEqual([null]);
    expect(await opacity(page, '#a')).toBe('1');
    expect(await page.evaluate(() => document.documentElement.hasAttribute('data-merfy-motion'))).toBe(false);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('load-1…3 — при загрузке: 700 мс material, задержки 50, 150 и 280 мс, сверху 16 и снизу 20 px', async () => {
    const { page } = await open();
    const loads = await animations(page, '#l1, #l2, #l3');
    expect(loads.map((info) => info?.delay)).toEqual([50, 150, 280]);
    expect(loads.map((info) => info?.first.transform)).toEqual([
      'translate(0px, -16px)',
      'translate(0px, 20px)',
      'translate(0px, 20px)',
    ]);
    expect(loads[0]?.duration).toBe(700);
    expect(loads[0]?.easing).toEqual(curve('material'));
    await page.close();
  });

  it('ниже экрана — скрыт и без анимации; в экране — одна пачка через 80 мс; группа — дети через 70 мс; data-delay прибавляется', async () => {
    const { page } = await open();
    expect(await opacity(page, '#below1')).toBe('0');
    expect(await animations(page, '#below1')).toEqual([null]);
    await scrollTo(page, 'b', '#below1');
    expect((await animations(page, '#below1, #below2')).map((info) => info?.delay)).toEqual([0, 80]);
    expect((await animations(page, '#group > li')).map((info) => info?.delay)).toEqual([0, 70, 140]);
    const [delayed] = await animations(page, '#delayed');
    expect(delayed).toMatchObject({ duration: 650, delay: 200, first: { transform: 'translate(0px, 20px)' } });
    expect(delayed?.easing).toEqual(curve('material'));
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('#below2'), (el) => getComputedStyle(el).opacity).join() === '1',
    );
    await page.close();
  });

  it('letters: буквы — span с aria-hidden, у элемента aria-label; через 30 мс, снизу 0.4em', async () => {
    const { page } = await open();
    expect(
      await page.$eval('#letters', (el) => [
        el.getAttribute('aria-label'),
        el.querySelectorAll('span[aria-hidden="true"]').length,
      ]),
    ).toEqual(['Шарф', 4]);
    await scrollTo(page, 'b', '#letters > span');
    const letters = await animations(page, '#letters > span');
    expect(letters.map((info) => info?.delay)).toEqual([0, 30, 60, 90]);
    expect(letters[0]?.first.transform).toBe('translate(0em, 0.4em)');
    await page.close();
  });

  it('appear-side: чётная секция main — слева, нечётная — справа; 700 мс power3.out', async () => {
    const { page } = await open();
    await scrollTo(page, 'side2', '#side2');
    const [even, odd] = await animations(page, '#side2, #side3');
    expect(even?.first.transform).toBe('translate(-32px, 24px)');
    expect(odd?.first.transform).toBe('translate(32px, 24px)');
    expect(even?.duration).toBe(700);
    expect(even?.easing).toEqual(curve('power3.out'));
    await page.close();
  });

  it.each([
    ['выбор «Появление секций» выключен', { motionReveal: false }],
    ['«уменьшить движение»', { reducedMotion: true }],
    ['превью конструктора', { mode: 'preview' as const }],
  ])('%s — появлений нет, всё видно', async (_name, extra) => {
    const { page, errors } = await open(extra);
    expect(await animations(page, '#top, #l1, #below1, #side2')).toEqual([null, null, null, null]);
    expect(await opacity(page, '#below1')).toBe('1');
    expect(await page.$eval('#letters', (el) => [el.children.length, el.hasAttribute('aria-label')])).toEqual([
      0,
      false,
    ]);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('ядро не запустилось — запасной CSS показывает всё через 3 с', async () => {
    const { page } = await open({ withoutCore: true });
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-merfy-motion'))).toBe('pending');
    expect(await opacity(page, '#below1')).toBe('0');
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('#below1'), (el) => getComputedStyle(el).opacity).join() === '1',
      undefined,
      {
        timeout: 5000,
      },
    );
    await page.close();
  });

  it('снятие секции до прокрутки — наблюдение снято, ошибок нет', async () => {
    const { page, errors } = await open();
    await page.evaluate(() => {
      const below = document.getElementById('below1');
      window.scrollTo(0, 0);
      document.getElementById('b')?.remove();
      document.querySelector('main')?.append(below ?? '');
    });
    await page.evaluate(() => document.getElementById('below1')?.scrollIntoView());
    await page.waitForTimeout(300);
    expect(await animations(page, '#below1')).toEqual([null]);
    expect(errors).toEqual([]);
    await page.close();
  });
});

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
  <merfy-section data-section="shop:e" data-section-id="e" id="e" style="display:block;height:700px;width:320px">
    <h2 data-animate="words" id="words" style="font:24px/30px sans-serif;margin:0">Три слова</h2>
    <h2 data-animate="lines" id="lines" style="font:24px/30px sans-serif;margin:0">Раз два три четыре пять шесть семь восемь девять десять одиннадцать двенадцать</h2>
    <div data-animate="mask-up" id="mask" style="height:50px">Маска</div>
    <div data-animate="blur-in" id="blur" style="height:50px">Размытие</div>
    <svg data-animate="draw" id="draw" viewBox="0 0 10 10" width="100"><path d="M0 0L10 10" stroke="black"/><path d="M0 10L10 0" stroke="black"/></svg>
  </merfy-section>
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

  it('words: слова в масках с overflow: hidden, aria-label; поднимаются на 105 % через 60 мс, 900 мс expo.out', async () => {
    const { page, errors } = await open();
    expect(await page.$eval('#words', (el) => el.getAttribute('aria-label'))).toBe('Три слова');
    expect(await page.$$eval('#words > span', (nodes) => nodes.map((n) => getComputedStyle(n).overflow))).toEqual([
      'hidden',
      'hidden',
    ]);
    expect(await opacity(page, '#words > span > span')).toBe('0');
    await scrollTo(page, 'e', '#words > span > span');
    const words = await animations(page, '#words > span > span');
    expect(words.map((info) => info?.delay)).toEqual([0, 60]);
    expect(words[0]).toMatchObject({ duration: 900, first: { opacity: '0', transform: 'translate(0%, 105%)' } });
    expect(words[0]?.easing).toEqual(curve('expo.out'));
    expect(errors).toEqual([]);
    await page.close();
  });

  it('lines: строки после загрузки шрифтов, каждая в маске; элемент не остаётся скрытым; 110 мс между строками', async () => {
    const { page, errors } = await open();
    await page.waitForFunction(() => document.querySelectorAll('#lines > span').length > 1);
    expect(await page.$eval('#lines', (el) => (el instanceof HTMLElement ? el.style.opacity : null))).toBe('');
    const count = await page.$$eval('#lines > span', (nodes) => nodes.length);
    expect(await opacity(page, '#lines > span > span')).toBe('0');
    await scrollTo(page, 'e', '#lines > span > span');
    const lines = await animations(page, '#lines > span > span');
    expect(lines.map((info) => info?.delay)).toEqual(Array.from({ length: count }, (_item, index) => index * 110));
    expect(lines[0]).toMatchObject({ duration: 1100, first: { transform: 'translate(0%, 110%)' } });
    expect(errors).toEqual([]);
    await page.close();
  });

  it('mask-up: clip-path снизу вверх и подъём на 40 px, без прозрачности; инлайн снимается после появления', async () => {
    const { page, errors } = await open();
    expect(await page.$eval('#mask', (el) => (el instanceof HTMLElement ? el.style.clipPath : null))).toContain(
      'inset(100%',
    );
    await scrollTo(page, 'e', '#mask');
    const [mask] = await animations(page, '#mask');
    expect(mask).toMatchObject({ duration: 1200, first: { transform: 'translate(0px, 40px)' } });
    expect(mask?.first.clipPath).toContain('inset(100%');
    expect(mask?.first.opacity).toBeUndefined();
    expect(mask?.easing).toEqual(curve('expo.out'));
    await page.waitForFunction(() => document.getElementById('mask')?.style.clipPath === '', undefined, {
      timeout: 5000,
    });
    expect(errors).toEqual([]);
    await page.close();
  });

  it('blur-in: размытие 16 px → 0, прозрачность 0 → 1, подъём 12 px; filter снимается после появления', async () => {
    const { page, errors } = await open();
    expect(await opacity(page, '#blur')).toBe('0');
    await scrollTo(page, 'e', '#blur');
    const [blur] = await animations(page, '#blur');
    expect(blur).toMatchObject({
      duration: 1100,
      first: { opacity: '0', filter: 'blur(16px)', transform: 'translate(0px, 12px)' },
      last: { opacity: '1', filter: 'blur(0px)' },
    });
    await page.waitForFunction(() => document.getElementById('blur')?.style.filter === '', undefined, {
      timeout: 5000,
    });
    expect(errors).toEqual([]);
    await page.close();
  });

  it('draw: у линий SVG pathLength="1", штрих 1, сдвиг 1 → 0, линии по очереди через 160 мс', async () => {
    const { page, errors } = await open();
    expect(await page.$$eval('#draw path', (nodes) => nodes.map((n) => n.getAttribute('pathLength')))).toEqual(['1', '1']);
    await scrollTo(page, 'e', '#draw path');
    const paths = await animations(page, '#draw path');
    expect(paths.map((info) => info?.delay)).toEqual([0, 160]);
    expect(paths[0]).toMatchObject({ duration: 1600, first: { strokeDashoffset: '1' }, last: { strokeDashoffset: '0' } });
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll<SVGElement>('#draw path')).every((n) => n.style.strokeDashoffset === ''),
      undefined,
      { timeout: 6000 },
    );
    expect(errors).toEqual([]);
    await page.close();
  });

  it.each([['«уменьшить движение»', { reducedMotion: true }]])('%s — новые пресеты ничего не режут и не прячут', async (_name, extra) => {
    const { page, errors } = await open(extra);
    expect(await page.$$eval('#words, #lines', (nodes) => nodes.map((n) => n.children.length))).toEqual([0, 0]);
    expect(await page.$eval('#mask', (el) => (el instanceof HTMLElement ? el.style.clipPath : null))).toBe('');
    expect(await page.$eval('#draw path', (el) => el.hasAttribute('pathLength'))).toBe(false);
    expect(await opacity(page, '#blur')).toBe('1');
    expect(errors).toEqual([]);
    await page.close();
  });

  it.each([
    ['выбор «Появление секций» выключен', { motionReveal: false }],
    ['«уменьшить движение»', { reducedMotion: true }],
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

  it('превью конструктора: появления играют при входе в экран, как на витрине; «Появление секций» выключено — нет', async () => {
    const { page, errors } = await open({ mode: 'preview' });
    await page.waitForFunction(() => (document.getElementById('top')?.getAnimations().length ?? 0) > 0);
    expect(await opacity(page, '#below1')).toBe('0');
    await scrollTo(page, 'b', '#below1');
    expect(errors).toEqual([]);
    await page.close();
    const off = await open({ mode: 'preview', motionReveal: false });
    expect(await animations(off.page, '#top, #below1')).toEqual([null, null]);
    expect(await opacity(off.page, '#below1')).toBe('1');
    await off.page.close();
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

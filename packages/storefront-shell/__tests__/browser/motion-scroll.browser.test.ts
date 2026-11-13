import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PAGE_TRANSITION_SCRIPT, pageTransitionCss } from '../../src/core/behaviors/page-transition';
import { frames, openPage, type PageOptions } from './behaviors-support';

// ctx.scroll, ctx.inView и ctx.lib.motion в Chromium (13.11, части 2б и 2в спеки анимаций): прогресс прохода секции через
// экран крутит анимацию или зовёт функцию, вход в экран зовёт код секции, полный Motion — таймлайн, числа и x/y.
// «Уменьшить движение» и превью — последний кадр, снятие секции — отписка и остановка.

declare global {
  interface Window {
    __progress?: number[];
    __enter?: number;
    __leave?: number;
    __count?: string;
    __error?: string;
    __lib?: string;
  }
}

const TALL = '<div style="height:1600px"></div>';
const SECTION = (inner: string): string =>
  `${TALL}<merfy-section data-section="shop:hero" data-section-id="hero" style="display:block;height:400px">${inner}</merfy-section>${TALL}`;
const BOX = '<p data-ref="box" style="margin:0;width:100px;height:40px">Шарфы</p>';
// Запуск секции в превью после правки настроек или текста (#467, prefs.ts): метка data-merfy-still на узле секции.
const reduced = (page: PageOptions): PageOptions => ({ ...page, reducedMotion: true });
const still = (page: PageOptions): PageOptions => ({
  ...page,
  mode: 'preview',
  body: page.body.replace('<merfy-section ', '<merfy-section data-merfy-still '),
});

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

const scrollTo = async (page: Page, y: number): Promise<void> => {
  await page.evaluate((top) => window.scrollTo(0, top), y);
  await frames(page);
  await frames(page);
};
const opacity = (page: Page): Promise<number> =>
  page.$eval('[data-ref="box"]', (el) => Number(getComputedStyle(el).opacity));

const options = (code: string, extra: Partial<PageOptions> = {}): PageOptions => ({
  body: SECTION(BOX),
  animate: true,
  scroll: true,
  inView: true,
  sections: [{ name: 'shop:hero', code }],
  ...extra,
});

const PROGRESS = `export default { mount(el, ctx) {
  window.__progress = [];
  ctx.scroll(el, (p) => window.__progress.push(p), { offset: ['start end', 'end start'] });
} };`;

const SCRUB = `export default { mount(el, ctx) {
  const run = ctx.animate(el.ref('box'), { opacity: [0, 1] }, { duration: 1000, easing: 'linear' });
  ctx.scroll(el, run, { offset: ['start end', 'end start'] });
} };`;

describe('ctx.scroll', () => {
  it('fn получает прогресс 0…1 прохода секции через экран', async () => {
    const { page, errors } = await openPage(browser, options(PROGRESS));
    await scrollTo(page, 1600);
    await scrollTo(page, 1400);
    const values = await page.evaluate(() => window.__progress ?? []);
    expect(values.length).toBeGreaterThan(0);
    const last = values.at(-1) ?? -1;
    expect(last).toBeGreaterThan(0);
    expect(last).toBeLessThan(1);
    expect(values.every((value) => value >= 0 && value <= 1)).toBe(true);
    expect(errors).toEqual([]);
    await page.close();
  });

  it.each([
    ['витрина', {}],
    ['превью, первый запуск секции', { mode: 'preview' as const }],
  ])('%s: крутит анимацию ctx.animate — середина прохода — середина анимации, после — конец', async (_name, extra) => {
    const { page, errors } = await openPage(browser, options(SCRUB, extra));
    await scrollTo(page, 0);
    expect(await opacity(page)).toBeLessThan(0.05);
    // Секция 1600…2000, экран 800: проход от 800 до 2000, середина — 1400.
    await scrollTo(page, 1400);
    const middle = await opacity(page);
    expect(middle).toBeGreaterThan(0.3);
    expect(middle).toBeLessThan(0.7);
    await scrollTo(page, 3000);
    expect(await opacity(page)).toBeGreaterThan(0.95);
    expect(errors).toEqual([]);
    await page.close();
  });

  it.each([
    ['«уменьшить движение»', reduced],
    ['превью после правки настроек (data-merfy-still)', still],
  ])('%s — не следит: анимация на последнем кадре, fn получает 1', async (_name, change) => {
    const scrub = await openPage(browser, change(options(SCRUB)));
    await scrollTo(scrub.page, 0);
    expect(await opacity(scrub.page)).toBe(1);
    expect(scrub.errors).toEqual([]);
    await scrub.page.close();
    const fn = await openPage(browser, change(options(PROGRESS)));
    await scrollTo(fn.page, 1400);
    expect(await fn.page.evaluate(() => window.__progress)).toEqual([1]);
    await fn.page.close();
  });

  it('снятие секции — отписка: прокрутка больше не зовёт fn', async () => {
    const { page, errors } = await openPage(browser, options(PROGRESS));
    await scrollTo(page, 1300);
    await page.evaluate(() => document.querySelector('merfy-section')?.remove());
    await frames(page);
    const before = await page.evaluate(() => window.__progress?.length ?? 0);
    await scrollTo(page, 1500);
    expect(await page.evaluate(() => window.__progress?.length ?? 0)).toBe(before);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('чужая анимация и неверный offset — сбой секции sdk-call-invalid', async () => {
    const plain = `export default { mount(el, ctx) { ctx.scroll(el, { finished: Promise.resolve(), stop() {} }); } };`;
    const one = await openPage(browser, options(plain));
    expect(one.errors.join('\n')).toContain('ctx.scroll: анимация — ответ ctx.animate или ctx.lib.motion');
    await one.page.close();
    const offset = `export default { mount(el, ctx) { ctx.scroll(el, () => {}, { offset: ['url(x) end'] }); } };`;
    const two = await openPage(browser, options(offset));
    expect(two.errors.join('\n')).toContain('ctx.scroll: offset');
    await two.page.close();
  });
});

const VIEW = `export default { mount(el, ctx) {
  window.__enter = 0; window.__leave = 0;
  ctx.inView(el.ref('box'), (box) => { window.__enter += 1; box.toggleClass('seen', true); return () => { window.__leave += 1; }; });
} };`;
const ONCE = `export default { mount(el, ctx) {
  window.__enter = 0;
  ctx.inView(el.ref('box'), () => { window.__enter += 1; }, { once: true, amount: 'all' });
} };`;

describe('ctx.inView', () => {
  it('вход своего элемента — fn с обёрткой El, выход — то, что fn вернула', async () => {
    const { page, errors } = await openPage(browser, options(VIEW));
    await scrollTo(page, 0);
    expect(await page.evaluate(() => window.__enter)).toBe(0);
    await scrollTo(page, 1400);
    await page.waitForFunction(() => window.__enter === 1);
    expect(await page.$eval('[data-ref="box"]', (el) => el.classList.contains('seen'))).toBe(true);
    await scrollTo(page, 0);
    await page.waitForFunction(() => window.__leave === 1);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('once — только первый вход; снятие секции — отписка', async () => {
    const { page, errors } = await openPage(browser, options(ONCE));
    await scrollTo(page, 1400);
    await page.waitForFunction(() => window.__enter === 1);
    await scrollTo(page, 0);
    await scrollTo(page, 1400);
    await frames(page);
    expect(await page.evaluate(() => window.__enter)).toBe(1);
    expect(errors).toEqual([]);
    await page.close();
    const view = await openPage(browser, options(VIEW));
    await view.page.evaluate(() => document.querySelector('merfy-section')?.remove());
    await scrollTo(view.page, 1400);
    expect(await view.page.evaluate(() => window.__enter)).toBe(0);
    await view.page.close();
  });

  it('неверный margin — сбой секции sdk-call-invalid', async () => {
    const code = `export default { mount(el, ctx) { ctx.inView(el, () => {}, { margin: '10px; color: red' }); } };`;
    const { page, errors } = await openPage(browser, options(code));
    expect(errors.join('\n')).toContain('ctx.inView: margin');
    await page.close();
  });
});

const lib = (code: string, extra: Partial<PageOptions> = {}): PageOptions => ({
  body: SECTION(
    `${BOX}<p data-ref="two" style="margin:0;width:100px;height:40px">Пальто</p><span data-ref="count">0</span>`,
  ),
  animate: true,
  scroll: true,
  libMotion: true,
  sections: [{ name: 'shop:hero', code, uses: ['lib:motion'] }],
  ...extra,
});

const TIMELINE = `export default { mount(el, ctx) {
  const { timeline } = ctx.lib.motion;
  const tl = timeline([
    [el.ref('box'), { opacity: [0, 1], x: [0, 100] }, { duration: 300 }],
    [el.ref('two'), { opacity: [0, 1], '--glow': [0, 1] }, { duration: 300, at: '-100' }],
  ]);
  tl.finished.then(() => { window.__finished = true; });
} };`;
const COUNTER = `export default { mount(el, ctx) {
  const count = el.ref('count');
  ctx.lib.motion.tween(0, 12000, { duration: 300 }, (value) => { count.text(String(Math.round(value))); window.__count = String(Math.round(value)); })
    .finished.then(() => { window.__finished = true; });
} };`;

describe('ctx.lib.motion', () => {
  it('timeline: сегменты по очереди со сдвигом at, x — отдельная часть transform, finished по концу', async () => {
    const { page, errors } = await openPage(browser, lib(TIMELINE));
    await page.waitForFunction(() => window.__finished === true);
    expect(await opacity(page)).toBe(1);
    expect(await page.$eval('[data-ref="box"]', (el) => getComputedStyle(el).transform)).toBe(
      'matrix(1, 0, 0, 1, 100, 0)',
    );
    expect(await page.$eval('[data-ref="two"]', (el) => getComputedStyle(el).opacity)).toBe('1');
    expect(errors).toEqual([]);
    await page.close();
  });

  it('tween: счётчик доходит до 12000', async () => {
    const { page, errors } = await openPage(browser, lib(COUNTER));
    await page.waitForFunction(() => window.__finished === true);
    expect(await page.$eval('[data-ref="count"]', (el) => el.textContent)).toBe('12000');
    expect(errors).toEqual([]);
    await page.close();
  });

  it('timeline крутится ctx.scroll; pause и time в мс', async () => {
    const code = `export default { mount(el, ctx) {
      const tl = ctx.lib.motion.timeline([[el.ref('box'), { opacity: [0, 1] }, { duration: 1000, easing: 'linear' }]]);
      ctx.scroll(el, tl, { offset: ['start end', 'end start'] });
    } };`;
    const { page, errors } = await openPage(browser, lib(code));
    await scrollTo(page, 0);
    await scrollTo(page, 1400);
    const middle = await opacity(page);
    expect(middle).toBeGreaterThan(0.3);
    expect(middle).toBeLessThan(0.7);
    expect(errors).toEqual([]);
    await page.close();
    const timeCode = `export default { mount(el, ctx) {
      const run = ctx.lib.motion.animate(el.ref('box'), { opacity: [0, 1] }, { duration: 1000, easing: 'linear' });
      run.pause(); run.time = 500; window.__lib = String(Math.round(run.time));
    } };`;
    const timed = await openPage(browser, lib(timeCode));
    await frames(timed.page);
    expect(await timed.page.evaluate(() => window.__lib)).toBe('500');
    const value = await opacity(timed.page);
    expect(value).toBeGreaterThan(0.4);
    expect(value).toBeLessThan(0.6);
    await timed.page.close();
  });

  it.each([
    ['«уменьшить движение»', reduced],
    ['превью после правки настроек (data-merfy-still)', still],
  ])('%s — timeline и tween сразу на последнем кадре', async (_name, change) => {
    const timeline = await openPage(browser, change(lib(TIMELINE)));
    await timeline.page.waitForFunction(() => window.__finished === true, undefined, { timeout: 500 });
    expect(await opacity(timeline.page)).toBe(1);
    await timeline.page.close();
    const counter = await openPage(browser, change(lib(COUNTER)));
    await counter.page.waitForFunction(() => window.__finished === true, undefined, { timeout: 500 });
    expect(await counter.page.evaluate(() => window.__count)).toBe('12000');
    expect(counter.errors).toEqual([]);
    await counter.page.close();
  });

  it('снятие секции останавливает анимацию: finished выполнено, значение не дошло', async () => {
    const code = `export default { mount(el, ctx) {
      ctx.lib.motion.animate(el.ref('box'), { opacity: [0, 1] }, { duration: 5000 }).finished.then(() => { window.__finished = true; });
    } };`;
    const { page, errors } = await openPage(browser, lib(code));
    const box = await page.$('[data-ref="box"]');
    await page.evaluate(() => document.querySelector('merfy-section')?.remove());
    await page.waitForFunction(() => window.__finished === true);
    expect(await box?.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeLessThan(0.5);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('url( в кадрах, чужой элемент — сбой sdk-call-invalid; без uses "lib:motion" ctx.lib пуст', async () => {
    const url = `export default { mount(el, ctx) { ctx.lib.motion.animate(el.ref('box'), { maskImage: 'url(https://x.example/m.svg)' }); } };`;
    const one = await openPage(browser, lib(url));
    expect(one.errors.join('\n')).toContain('нельзя url(');
    await one.page.close();
    const foreign = `export default { mount(el, ctx) { ctx.lib.motion.animate({}, { opacity: 1 }); } };`;
    const two = await openPage(browser, lib(foreign));
    expect(two.errors.join('\n')).toContain('ctx.lib.motion.animate: элемент не из этой секции');
    await two.page.close();
    const without = `export default { mount(el, ctx) { window.__lib = String(Object.keys(ctx.lib)); } };`;
    const three = await openPage(browser, {
      ...lib(without),
      sections: [{ name: 'shop:hero', code: without }],
    });
    expect(await three.page.evaluate(() => window.__lib)).toBe('');
    await three.page.close();
  });
});

// Скрипт имён переходов между страницами (часть 2д) — тот же текст, что сборка кладёт в <head>; события pageswap и
// pagereveal — подставные, с полями, которые читает скрипт.
describe('переходы между страницами: data-vt → view-transition-name', () => {
  const names = (page: Page): Promise<string[]> =>
    page.$$eval('[data-vt]', (list) =>
      list.map((el) => (el instanceof HTMLElement ? el.style.viewTransitionName : '')),
    );
  const fire = (page: Page, type: string, extra: object): Promise<void> =>
    page.evaluate(([name, fields]) => void window.dispatchEvent(Object.assign(new Event(name), fields)), [
      type,
      extra,
    ] as const);

  it('новая страница: имя vt-<имя> всем [data-vt], повтор — только первому, знаки чистятся', async () => {
    const body = '<img data-vt="p-1"><img data-vt="p-1"><img data-vt="фото x"><div data-vt="logo"></div>';
    const { page, errors } = await openPage(browser, { body, beforeCore: PAGE_TRANSITION_SCRIPT });
    await fire(page, 'pagereveal', { viewTransition: {} });
    expect(await names(page)).toEqual(['vt-p-1', '', 'vt------x', 'vt-logo']);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('уходящая страница: вне ссылок и в ссылке, по которой ушли; без перехода и при «уменьшить движение» — ничего', async () => {
    const body =
      '<a href="/products/a"><img data-vt="p-a"></a><a href="/products/b"><img data-vt="p-b"></a><div data-vt="logo"></div>';
    const { page } = await openPage(browser, { body, beforeCore: PAGE_TRANSITION_SCRIPT });
    await fire(page, 'pageswap', { viewTransition: null });
    expect(await names(page)).toEqual(['', '', '']);
    await fire(page, 'pageswap', {
      viewTransition: {},
      activation: { entry: { url: 'https://shop.test/products/b' } },
    });
    expect(await names(page)).toEqual(['', 'vt-p-b', 'vt-logo']);
    await page.close();
    const reduced = await openPage(browser, { body, beforeCore: PAGE_TRANSITION_SCRIPT, reducedMotion: true });
    await fire(reduced.page, 'pagereveal', { viewTransition: {} });
    expect(await names(reduced.page)).toEqual(['', '', '']);
    await reduced.page.close();
  });

  it('CSS fade: браузер принимает @view-transition под media', async () => {
    const { page } = await openPage(browser, { body: '<p>x</p>', css: pageTransitionCss('slide') });
    const rules = await page.evaluate(() =>
      [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules].map((rule) => rule.cssText)).join('\n'),
    );
    expect(rules).toContain('@view-transition');
    expect(rules).toContain('merfy-vt-in');
    await page.close();
  });
});

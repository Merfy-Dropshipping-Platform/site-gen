import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { animations, curve, openPage, type PageOptions } from './behaviors-support';

// ctx.animate в Chromium (design.md блока 6, раздел 10): длительность и задержка — мс, кривая по имени или массивом
// Безье, превью и «уменьшить движение» — сразу последний кадр, снятие секции останавливает анимацию.
const BOX =
  '<merfy-section data-section="shop:hero" data-section-id="hero"><p data-ref="box">Шарфы</p></merfy-section>';
const RISE = `export default {
  mount(el, ctx) {
    const box = el.ref('box');
    const run = ctx.animate(box, { opacity: [0, 1], transform: ['translate(0px, 24px)', 'none'] },
      { duration: 600, delay: 50, easing: 'power2.out' });
    window.__run = run;
    run.finished.then(() => { window.__finished = true; });
  },
};`;
const LONG = `export default {
  mount(el, ctx) {
    const run = ctx.animate(el.ref('box'), { opacity: [0, 1] }, { duration: 5000, easing: [0.1, 0.2, 0.3, 1] });
    run.finished.then(() => { window.__finished = true; });
  },
};`;
const DEFAULTS = `export default { mount(el, ctx) { ctx.animate(el.ref('box'), { opacity: [0.5, 1] }); } };`;

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

const options = (code: string, extra: Partial<PageOptions> = {}): PageOptions => ({
  body: BOX,
  animate: true,
  sections: [{ name: 'shop:hero', code }],
  ...extra,
});

describe('ctx.animate', () => {
  it('длительность и задержка — мс, кривая по имени, кадры — как переданы', async () => {
    const { page, errors } = await openPage(browser, options(RISE));
    const [box] = await animations(page, '[data-ref="box"]');
    expect(box).toMatchObject({ count: 2, duration: 600, delay: 50 });
    expect(box?.easing).toEqual(curve('power2.out'));
    expect(box?.first).toEqual({ opacity: '0', transform: 'translate(0px, 24px)' });
    expect(box?.last).toEqual({ opacity: '1', transform: 'none' });
    await page.waitForFunction(() => window.__finished === true);
    expect(await page.$eval('[data-ref="box"]', (el) => getComputedStyle(el).opacity)).toBe('1');
    expect(errors).toEqual([]);
    await page.close();
  });

  it('кривая массивом Безье; без параметров — 300 мс и ease-out', async () => {
    const long = await openPage(browser, options(LONG));
    const [box] = await animations(long.page, '[data-ref="box"]');
    expect(box).toMatchObject({ duration: 5000, delay: 0, running: true });
    expect(box?.easing).toEqual([0.1, 0.2, 0.3, 1]);
    await long.page.close();
    const plain = await openPage(browser, options(DEFAULTS));
    const [defaults] = await animations(plain.page, '[data-ref="box"]');
    expect(defaults).toMatchObject({ duration: 300, delay: 0 });
    expect(defaults?.easing).toEqual(curve('ease-out'));
    await plain.page.close();
  });

  it('«уменьшить движение» — сразу последний кадр, finished выполнено', async () => {
    const { page, errors } = await openPage(browser, options(RISE, { reducedMotion: true }));
    await page.waitForFunction(() => window.__finished === true, undefined, {
      timeout: 200,
    });
    expect(await page.$eval('[data-ref="box"]', (el) => getComputedStyle(el).opacity)).toBe('1');
    expect(errors).toEqual([]);
    await page.close();
  });

  it('превью конструктора: первый запуск секции играет анимацию, как на витрине', async () => {
    const { page, errors } = await openPage(browser, options(RISE, { mode: 'preview' }));
    const [box] = await animations(page, '[data-ref="box"]');
    expect(box).toMatchObject({ count: 2, duration: 600, delay: 50, running: true });
    expect(errors).toEqual([]);
    await page.close();
  });

  it('снятие секции останавливает анимацию; finished выполнено, не отклонено', async () => {
    const { page, errors } = await openPage(browser, options(LONG));
    expect((await animations(page, '[data-ref="box"]'))[0]?.running).toBe(true);
    const running = await page.evaluate(() => {
      const box = document.querySelector('[data-ref="box"]');
      document.querySelector('merfy-section')?.remove();
      return new Promise<number>((resolve) =>
        queueMicrotask(() =>
          setTimeout(
            () =>
              resolve(
                document
                  .getAnimations()
                  .filter(
                    (a) => a.playState === 'running' && a.effect instanceof KeyframeEffect && a.effect.target === box,
                  ).length,
              ),
            50,
          ),
        ),
      );
    });
    expect(running).toBe(0);
    await page.waitForFunction(() => window.__finished === true, undefined, {
      timeout: 1000,
    });
    expect(errors).toEqual([]);
    await page.close();
  });

  it('нет кода анимаций на странице — сбой секции с текстом для автора, страница работает', async () => {
    const { page, errors } = await openPage(browser, options(RISE, { animate: false }));
    await page.waitForFunction(
      () => document.querySelector('merfy-section')?.getAttribute('data-merfy-state') === 'failed',
    );
    expect(errors.some((text) => text.includes('ctx.animate: на странице нет кода анимаций'))).toBe(true);
    await page.close();
  });
});

// 12.11, этап 2а–2г спеки анимаций: новые свойства, пружина, список со stagger, повтор, ctx.split, pointermove.
const LIST_BODY = `<merfy-section data-section="shop:hero" data-section-id="hero" style="display:block">
  <h1 data-ref="title" style="width:260px;font:24px/30px sans-serif;margin:0">Раз два три четыре пять шесть семь восемь девять десять</h1>
  <svg viewBox="0 0 10 10" width="100"><path data-ref="line" d="M0 0 L10 10" stroke="black" /></svg>
  <ul><li data-ref="item">1</li><li data-ref="item">2</li><li data-ref="item">3</li></ul>
  <button data-ref="magnet" style="position:absolute;left:300px;top:300px;width:100px;height:40px">Магнит</button>
</merfy-section>`;
const listOptions = (code: string, extra: Partial<PageOptions> = {}): PageOptions => ({
  body: LIST_BODY,
  animate: true,
  sections: [{ name: 'shop:hero', code }],
  ...extra,
});
const timing = (page: Page, selector: string) =>
  page.evaluate(
    (target) =>
      [...document.querySelectorAll(target)].map((el) =>
        el.getAnimations().map((a) => {
          const t = a.effect?.getTiming();
          return { iterations: t?.iterations, direction: t?.direction, duration: Number(t?.duration), easing: t?.easing };
        }),
      ),
    selector,
  );
const failed = (page: Page) =>
  page.waitForFunction(() => document.querySelector('merfy-section')?.getAttribute('data-merfy-state') === 'failed');

describe('ctx.animate: новые свойства, пружина, список, повтор', () => {
  it('clipPath, filter, strokeDashoffset, letterSpacing, borderRadius, backgroundPosition — кадры как переданы', async () => {
    const code = `export default { mount(el, ctx) {
      ctx.animate(el.ref('title'), { clipPath: ['inset(100% 0% 0% 0%)', 'inset(0% 0% 0% 0%)'], filter: ['blur(12px)', 'blur(0px)'],
        letterSpacing: ['0.2em', '0em'], borderRadius: ['0px', '12px'], backgroundPosition: ['0% 0%', '100% 0%'] }, { duration: 5000 });
      ctx.animate(el.ref('line'), { strokeDasharray: [1, 1], strokeDashoffset: [1, 0] }, { duration: 5000 });
    } };`;
    const { page, errors } = await openPage(browser, listOptions(code));
    const [title] = await animations(page, '[data-ref="title"]');
    // Chromium записывает inset(100% 0% 0% 0%) короче — inset(100% 0% 0%)
    expect(title?.first).toMatchObject({ filter: 'blur(12px)', letterSpacing: '0.2em' });
    expect(title?.first.clipPath).toMatch(/^inset\(100% 0%/);
    expect(title?.last).toMatchObject({ filter: 'blur(0px)', letterSpacing: '0em' });
    expect(title?.last.clipPath).toMatch(/^inset\(0%/);
    const [line] = await animations(page, '[data-ref="line"]');
    expect(line?.first).toMatchObject({ strokeDashoffset: '1' });
    expect(line?.last).toMatchObject({ strokeDashoffset: '0' });
    expect(errors).toEqual([]);
    await page.close();
  });

  it('filter с drop-shadow — сбой секции с текстом для автора', async () => {
    const code = `export default { mount(el, ctx) { ctx.animate(el.ref('title'), { filter: ['none', 'drop-shadow(0 0 4px red)'] }); } };`;
    const { page, errors } = await openPage(browser, listOptions(code));
    await failed(page);
    expect(errors.some((text) => text.includes('ctx.animate: filter'))).toBe(true);
    await page.close();
  });

  it('список элементов одним вызовом: stagger сдвигает старт на каждый следующий; finished — когда закончили все', async () => {
    const code = `export default { mount(el, ctx) {
      const run = ctx.animate(el.refs('item'), { opacity: [0, 1] }, { duration: 200, delay: 30, stagger: 100 });
      run.finished.then(() => { window.__finished = true; });
    } };`;
    const { page, errors } = await openPage(browser, listOptions(code));
    expect((await animations(page, '[data-ref="item"]')).map((info) => info?.delay)).toEqual([30, 130, 230]);
    await page.waitForFunction(() => window.__finished === true);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('easing: { spring } — пружина: длительность spring.duration, кривая linear(…) с отскоком выше 1', async () => {
    const code = `export default { mount(el, ctx) {
      ctx.animate(el.ref('title'), { transform: ['translateY(40px)', 'none'] }, { easing: { spring: { bounce: 0.4, duration: 800 } } });
    } };`;
    const { page, errors } = await openPage(browser, listOptions(code));
    const run = (await timing(page, '[data-ref="title"]'))[0]?.[0];
    expect(run?.duration).toBe(800);
    expect(run?.easing).toMatch(/^linear\(/);
    const peak = Math.max(...(run?.easing?.match(/-?\d+(\.\d+)?/g) ?? []).map(Number));
    expect(peak).toBeGreaterThan(1);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('repeat и repeatType: число повторов, Infinity, reverse — туда-обратно', async () => {
    const code = `export default { mount(el, ctx) {
      ctx.animate(el.ref('title'), { opacity: [0.5, 1] }, { duration: 400, repeat: 2 });
      ctx.animate(el.ref('line'), { opacity: [0.5, 1] }, { duration: 400, repeat: Infinity, repeatType: 'reverse' });
    } };`;
    const { page, errors } = await openPage(browser, listOptions(code));
    expect((await timing(page, '[data-ref="title"]'))[0]?.[0]).toMatchObject({ iterations: 3, direction: 'normal' });
    expect((await timing(page, '[data-ref="line"]'))[0]?.[0]).toMatchObject({
      iterations: Infinity,
      direction: 'alternate',
    });
    expect(errors).toEqual([]);
    await page.close();
  });

  it.each([['«уменьшить движение»', { reducedMotion: true }]])('%s — без повтора: сразу последний кадр, finished выполнено', async (_name, extra) => {
    const code = `export default { mount(el, ctx) {
      ctx.animate(el.refs('item'), { opacity: [0.5, 1] }, { duration: 400, repeat: Infinity, stagger: 500, easing: { spring: { bounce: 0.3 } } })
        .finished.then(() => { window.__finished = true; });
    } };`;
    const { page, errors } = await openPage(browser, listOptions(code, extra));
    await page.waitForFunction(() => window.__finished === true, undefined, { timeout: 500 });
    expect(await page.$$eval('[data-ref="item"]', (nodes) => nodes.map((n) => getComputedStyle(n).opacity))).toEqual([
      '1',
      '1',
      '1',
    ]);
    expect(errors).toEqual([]);
    await page.close();
  });
});

describe('ctx.split', () => {
  it('chars и words: куски — aria-hidden, текст — в aria-label; списки своей секции', async () => {
    const code = `export default { mount(el, ctx) {
      window.__words = ctx.split(el.ref('title'), 'words').length;
      window.__chars = ctx.split(el.ref('item'), 'chars').length;
    } };`;
    const { page, errors } = await openPage(browser, listOptions(code));
    await page.waitForFunction(() => window.__words !== undefined);
    expect(await page.evaluate(() => [window.__words, window.__chars])).toEqual([10, 1]);
    expect(
      await page.$eval('[data-ref="title"]', (el) => [
        el.getAttribute('aria-label'),
        el.querySelectorAll(':scope > span[aria-hidden="true"]').length,
      ]),
    ).toEqual(['Раз два три четыре пять шесть семь восемь девять десять', 10]);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('lines: строки по раскладке после загрузки шрифтов — Promise; каждая строка — блок с aria-hidden', async () => {
    const code = `export default { async mount(el, ctx) {
      const lines = await ctx.split(el.ref('title'), 'lines');
      window.__lines = lines.length;
      ctx.animate(lines, { transform: ['translateY(100%)', 'none'] }, { duration: 5000, stagger: 100 });
    } };`;
    const { page, errors } = await openPage(browser, listOptions(code));
    await page.waitForFunction(() => window.__lines !== undefined);
    const lines = (await page.evaluate(() => window.__lines)) ?? 0;
    expect(lines).toBeGreaterThan(1);
    expect(await page.$$eval('[data-ref="title"] > span', (nodes) => nodes.length)).toBe(lines);
    expect(
      await page.$$eval('[data-ref="title"] > span', (nodes) => nodes.map((n) => getComputedStyle(n).display)),
    ).toEqual(Array.from({ length: lines }, () => 'block'));
    expect((await animations(page, '[data-ref="title"] > span')).map((info) => info?.delay)).toEqual(
      Array.from({ length: lines }, (_item, index) => index * 100),
    );
    expect(errors).toEqual([]);
    await page.close();
  });

  it('неизвестный способ — сбой секции с текстом для автора', async () => {
    const code = `export default { mount(el, ctx) { ctx.split(el.ref('title'), 'sentences'); } };`;
    const { page, errors } = await openPage(browser, listOptions(code));
    await failed(page);
    expect(errors.some((text) => text.includes('ctx.split'))).toBe(true);
    await page.close();
  });
});

describe('ctx.on pointermove', () => {
  const code = `export default { mount(el, ctx) {
    window.__moves = [];
    ctx.on('document', 'pointermove', (event) => {
      const at = event.at(el.ref('magnet'));
      window.__moves.push({ x: event.pointer.x, py: event.pointer.py, inside: event.inside(el.ref('magnet')), magnetPx: at && at.px });
    });
  } };`;

  it('не чаще раза в кадр, берётся последнее событие; координаты — от секции и от элемента', async () => {
    const { page, errors } = await openPage(browser, listOptions(code));
    await page.evaluate(() => {
      for (const x of [10, 20, 350]) {
        document.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: 320, bubbles: true }));
      }
    });
    await page.waitForFunction(() => (window.__moves ?? []).length > 0);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const moves = await page.evaluate(() => window.__moves);
    expect(moves).toHaveLength(1);
    expect(moves?.[0]).toMatchObject({ x: 350, magnetPx: 0.5 });
    expect(moves?.[0]?.py).toBeGreaterThan(0);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('«уменьшить движение» событие не отключает; после снятия секции события не приходят', async () => {
    const { page } = await openPage(browser, listOptions(code, { reducedMotion: true }));
    await page.mouse.move(120, 120);
    await page.waitForFunction(() => (window.__moves ?? []).length > 0);
    await page.evaluate(() => document.querySelector('merfy-section')?.remove());
    await new Promise((resolve) => setTimeout(resolve, 50));
    const before = await page.evaluate(() => window.__moves?.length ?? 0);
    await page.mouse.move(200, 200);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await page.evaluate(() => window.__moves?.length ?? 0)).toBe(before);
    await page.close();
  });

  it('нет кода анимаций на странице — сбой секции с текстом для автора', async () => {
    const { page, errors } = await openPage(browser, listOptions(code, { animate: false }));
    await failed(page);
    expect(errors.some((text) => text.includes('ctx.on: на странице нет кода анимаций'))).toBe(true);
    await page.close();
  });
});

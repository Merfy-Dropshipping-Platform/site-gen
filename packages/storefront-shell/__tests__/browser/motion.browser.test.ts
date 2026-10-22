import { chromium, type Browser } from 'playwright';
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

  it.each([
    ['превью конструктора', { mode: 'preview' as const }],
    ['«уменьшить движение»', { reducedMotion: true }],
  ])('%s — сразу последний кадр, finished выполнено', async (_name, extra) => {
    const { page, errors } = await openPage(browser, options(RISE, extra));
    await page.waitForFunction(() => window.__finished === true, undefined, {
      timeout: 200,
    });
    expect(await page.$eval('[data-ref="box"]', (el) => getComputedStyle(el).opacity)).toBe('1');
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

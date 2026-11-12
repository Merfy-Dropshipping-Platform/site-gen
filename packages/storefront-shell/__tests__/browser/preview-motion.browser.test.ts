import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PREVIEW_REPLACE_EVENT, PREVIEW_REPLAY_EVENT } from '../../src/core/preview-protocol';
import { animations, openPage, type PageOptions } from './behaviors-support';

// Анимации в превью конструктора, в Chromium (этап 3 спеки анимаций, части 3а и 3б): первый запуск секции играет,
// правка настроек или текста — сразу последний кадр, правка кода — играет, «Проиграть анимации» — играет заново,
// «уменьшить движение» и выключенное «Появление секций» — без анимаций.
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const markup = (text: string): string =>
  `<merfy-section data-section="shop:hero" data-section-id="hero" style="display:block"><p data-ref="box">${text}</p><h2 data-animate="appear" id="head">${text}</h2></merfy-section>`;
const BODY = `<main>${markup('Шарфы')}<merfy-section data-section="shop:other" data-section-id="other" style="display:block"><p data-ref="box" id="other-box">Другая</p></merfy-section></main>`;
const CODE = `export default { mount(el, ctx) { ctx.animate(el.ref('box'), { opacity: [0, 1] }, { duration: 4000 }); } };`;

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

const open = (extra: Partial<PageOptions> = {}) =>
  openPage(browser, {
    body: BODY,
    mode: 'preview',
    preview: true,
    animate: true,
    reveal: true,
    motionReveal: true,
    headScript: true,
    sections: [
      { name: 'shop:hero', code: CODE },
      { name: 'shop:other', code: CODE },
    ],
    ...extra,
  });

const BOX = '[data-section-id="hero"] [data-ref="box"]';
const HEAD = '[data-section-id="hero"] #head';
const OTHER = '#other-box';
const running = async (page: Page, selector: string): Promise<boolean> =>
  (await animations(page, selector))[0]?.running === true;
const opacity = (page: Page, selector: string): Promise<string> =>
  page.$eval(selector, (el) => getComputedStyle(el).opacity);

// Замена секции hero, как её отправляет скрипт превью: тот же код (hash A) или новый (hash B, код из load).
const replaceHero = (page: Page, text: string, hash: string): Promise<string> =>
  page.evaluate(
    ([name, html, scriptHash]) =>
      new Promise<string>((resolve) => {
        const detail = {
          html,
          script: { hash: scriptHash, uses: [] },
          codeOnly: false,
          load: () =>
            Promise.resolve({
              mount(el: { ref(name: string): Element | null }, ctx: { animate(...args: unknown[]): unknown }) {
                ctx.animate(el.ref('box'), { opacity: [0, 1] }, { duration: 4000 });
              },
            }),
          reply: (outcome: string) => resolve(outcome),
        };
        const event = new CustomEvent(name, { bubbles: true, cancelable: true, detail });
        if (document.querySelector('[data-section-id="hero"]')?.dispatchEvent(event) !== false) resolve('not-handled');
      }),
    [PREVIEW_REPLACE_EVENT, markup(text), hash] as const,
  );

const replay = (page: Page, sectionId: string | null): Promise<void> =>
  page.evaluate(
    ([name, id]) => {
      const target = id === null ? document : document.querySelector(`[data-section-id="${id}"]`);
      target?.dispatchEvent(new Event(name, { bubbles: true }));
    },
    [PREVIEW_REPLAY_EVENT, sectionId] as const,
  );

describe('превью: когда анимации играют', () => {
  it('открыли превью — ctx.animate и появление играют', async () => {
    const { page, errors } = await open();
    expect(await running(page, BOX)).toBe(true);
    await page.waitForFunction((selector) => (document.querySelector(selector)?.getAnimations().length ?? 0) > 0, HEAD);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('правка текста (тот же код) — сразу последний кадр, без появления', async () => {
    const { page, errors } = await open();
    expect(await replaceHero(page, 'Новый текст', HASH_A)).toBe('fresh');
    expect(await page.textContent(BOX)).toBe('Новый текст');
    expect(await animations(page, BOX)).toEqual([null]);
    expect(await opacity(page, BOX)).toBe('1');
    expect(await animations(page, HEAD)).toEqual([null]);
    expect(await opacity(page, HEAD)).toBe('1');
    expect(await page.$eval('[data-section-id="hero"]', (el) => el.hasAttribute('data-merfy-still'))).toBe(false);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('правка кода секции — играет, а соседняя секция не перезапускается', async () => {
    const { page, errors } = await open();
    const before = (await animations(page, OTHER))[0]?.first;
    expect(await replaceHero(page, 'Шарфы', HASH_B)).toBe('fresh');
    expect(await running(page, BOX)).toBe(true);
    expect((await animations(page, OTHER))[0]?.first).toEqual(before);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('после правки текста ответ с той же разметкой секцию не трогает', async () => {
    const { page, errors } = await open();
    await replaceHero(page, 'Новый текст', HASH_A);
    expect(await replaceHero(page, 'Новый текст', HASH_A)).toBe('kept-state');
    expect(await running(page, BOX)).toBe(false);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('«Проиграть анимации» на секции — играет только она, даже после правки текста', async () => {
    const { page, errors } = await open();
    await replaceHero(page, 'Новый текст', HASH_A);
    await page.evaluate(() => document.getAnimations().forEach((animation) => animation.cancel()));
    expect(await running(page, OTHER)).toBe(false);
    await replay(page, 'hero');
    expect(await running(page, BOX)).toBe(true);
    expect(await running(page, OTHER)).toBe(false);
    expect(await page.textContent(BOX)).toBe('Новый текст');
    await page.waitForFunction((selector) => (document.querySelector(selector)?.getAnimations().length ?? 0) > 0, HEAD);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('«Проиграть анимации» на странице — играют все секции', async () => {
    const { page, errors } = await open();
    await page.evaluate(() => document.getAnimations().forEach((animation) => animation.cancel()));
    await replay(page, null);
    expect(await running(page, BOX)).toBe(true);
    expect(await running(page, OTHER)).toBe(true);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('«уменьшить движение» — повтор тоже без анимаций', async () => {
    const { page, errors } = await open({ reducedMotion: true });
    await replay(page, null);
    expect([await running(page, BOX), await running(page, OTHER)]).toEqual([false, false]);
    expect(await opacity(page, BOX)).toBe('1');
    expect(errors).toEqual([]);
    await page.close();
  });

  it('«Появление секций» выключено — появления не играют и после повтора; ctx.animate играет', async () => {
    const { page, errors } = await open({ motionReveal: false });
    await replay(page, 'hero');
    expect(await animations(page, HEAD)).toEqual([null]);
    expect(await opacity(page, HEAD)).toBe('1');
    expect(await running(page, BOX)).toBe(true);
    expect(errors).toEqual([]);
    await page.close();
  });
});

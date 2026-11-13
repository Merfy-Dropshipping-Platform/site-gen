import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LenisLib, LenisState } from '../../src/core/types';
import { frames, openPage, type PageOptions } from './behaviors-support';

// ctx.lib.lenis в Chromium (13.11, пункт 7 спеки анимаций): плавная прокрутка страницы Lenis — один экземпляр на
// страницу, пока есть секция с "lib:lenis"; Lenis двигает настоящую прокрутку, поэтому ctx.scroll крутит анимацию.
// «Уменьшить движение» и запуск в превью после правки (data-merfy-still) — прокрутка нативная, API тот же.

declare global {
  interface Window {
    __lenis?: LenisLib;
    __states?: LenisState[];
    __configured?: boolean[];
    __toBox?: () => void;
    __toForeign?: () => void;
  }
}

const TALL = '<div style="height:1600px"></div>';
const section = (id: string): string =>
  `<merfy-section data-section="shop:${id}" data-section-id="${id}" style="display:block;height:400px"><p data-ref="box" style="margin:0;width:100px;height:40px">Шарфы</p></merfy-section>`;
// Тема со scroll-behavior: smooth и height: 100% у <html> и <body> — то, с чем спорит Lenis без своих стилей.
const THEME_CSS = 'html{scroll-behavior:smooth;height:100%}body{height:100%}';

const SMOOTH = `export default { mount(el, ctx) {
  window.__lenis = ctx.lib.lenis;
  window.__states = [];
  ctx.lib.lenis.onScroll((state) => window.__states.push(state));
  window.__toBox = () => ctx.lib.lenis.scrollTo(el.ref('box'), { offset: -100, immediate: true });
  window.__toForeign = () => ctx.lib.lenis.scrollTo({}, { immediate: true });
  const run = ctx.animate(el.ref('box'), { opacity: [0, 1] }, { duration: 1000, easing: 'linear' });
  ctx.scroll(el, run, { offset: ['start end', 'end start'] });
} };`;

const page = (code: string, extra: Partial<PageOptions> = {}): PageOptions => ({
  body: `${TALL}${section('hero')}${TALL}`,
  css: THEME_CSS,
  animate: true,
  scroll: true,
  libLenis: true,
  sections: [{ name: 'shop:hero', code, uses: ['lib:lenis'] }],
  ...extra,
});

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

const scrollY = (target: Page): Promise<number> => target.evaluate(() => window.scrollY);
const opacity = (target: Page): Promise<number> =>
  target.$eval('[data-ref="box"]', (el) => Number(getComputedStyle(el).opacity));
const htmlState = (target: Page) =>
  target.evaluate(() => ({
    lenis: document.documentElement.classList.contains('lenis'),
    behavior: document.documentElement.style.scrollBehavior,
    height: document.documentElement.style.height,
    bodyHeight: document.body.style.height,
    overflow: document.documentElement.style.overflow,
  }));

describe('ctx.lib.lenis', () => {
  it('Lenis на странице: свои стили в style у <html> и <body>, scrollTo прокручивает плавно, ctx.scroll крутит анимацию', async () => {
    const { page: tab, errors } = await openPage(browser, page(SMOOTH));
    expect(await htmlState(tab)).toEqual({
      lenis: true,
      behavior: 'auto',
      height: 'auto',
      bodyHeight: 'auto',
      overflow: '',
    });
    await tab.evaluate(() => window.__lenis?.scrollTo(1400, { duration: 400 }));
    await frames(tab);
    const early = await scrollY(tab);
    expect(early).toBeLessThan(1400);
    await tab.waitForFunction(() => window.scrollY === 1400);
    await frames(tab);
    // Проход секции через экран — прокрутка 800…2000; 1400 — середина: анимация ctx.scroll не в начале и не в конце.
    const middle = await opacity(tab);
    expect(middle).toBeGreaterThan(0.2);
    expect(middle).toBeLessThan(0.8);
    const states = await tab.evaluate(() => window.__states ?? []);
    expect(states.length).toBeGreaterThan(2);
    expect(states.some((state) => state.scroll > 0 && state.scroll < 1400)).toBe(true);
    expect(states.at(-1)).toMatchObject({ scroll: 1400, limit: 2800, progress: 0.5 });
    expect(errors).toEqual([]);
    await tab.close();
  });

  it('колесо — плавно: промежуточные кадры до цели', async () => {
    const { page: tab, errors } = await openPage(browser, page(SMOOTH));
    await tab.mouse.move(400, 400);
    await tab.mouse.wheel(0, 400);
    await tab.waitForFunction(() => window.scrollY >= 399);
    const values = await tab.evaluate(() => (window.__states ?? []).map((state) => state.scroll));
    expect(values.some((value) => value > 0 && value < 399)).toBe(true);
    expect(errors).toEqual([]);
    await tab.close();
  });

  it('scrollTo к своему элементу с offset; чужой — сбой sdk-call-invalid', async () => {
    const { page: tab, errors } = await openPage(browser, page(SMOOTH));
    await tab.evaluate(() => window.__toBox?.());
    expect(await scrollY(tab)).toBe(1500);
    const failed = await tab.evaluate(() => {
      try {
        window.__toForeign?.();
        return '';
      } catch (error) {
        return `${String(Reflect.get(Object(error), 'code'))} ${String(error)}`;
      }
    });
    expect(failed).toContain('sdk-call-invalid');
    expect(failed).toContain('ctx.lib.lenis.scrollTo: элемент не из этой секции');
    expect(errors).toEqual([]);
    await tab.close();
  });

  it('stop запирает прокрутку (overflow у <html>), start отпирает; снятие секции снимает её запрет', async () => {
    const { page: tab } = await openPage(browser, page(SMOOTH));
    await tab.evaluate(() => window.__lenis?.stop());
    expect((await htmlState(tab)).overflow).toBe('hidden');
    await tab.mouse.move(400, 400);
    await tab.mouse.wheel(0, 400);
    await frames(tab);
    await frames(tab);
    expect(await scrollY(tab)).toBe(0);
    await tab.evaluate(() => window.__lenis?.start());
    expect((await htmlState(tab)).overflow).toBe('');
    await tab.evaluate(() => window.__lenis?.stop());
    await tab.evaluate(() => document.querySelector('merfy-section')?.remove());
    await tab.waitForFunction(() => !document.documentElement.classList.contains('lenis'));
    expect(await htmlState(tab)).toEqual({ lenis: false, behavior: '', height: '', bodyHeight: '', overflow: '' });
    // Снятая секция запрет больше не ставит: снять его было бы некому.
    await tab.evaluate(() => window.__lenis?.stop());
    expect((await htmlState(tab)).overflow).toBe('');
    await tab.close();
  });

  it('вместе с ctx.inView и ctx.lib.motion: вход в экран и таймлайн по прокрутке Lenis', async () => {
    const code = `export default { mount(el, ctx) {
      window.__lenis = ctx.lib.lenis;
      window.__enter = 0;
      ctx.inView(el.ref('box'), () => { window.__enter += 1; });
      const tl = ctx.lib.motion.timeline([[el.ref('box'), { opacity: [0, 1] }, { duration: 1000, easing: 'linear' }]]);
      ctx.scroll(el, tl, { offset: ['start end', 'end start'] });
    } };`;
    const { page: tab, errors } = await openPage(
      browser,
      page(code, {
        inView: true,
        libMotion: true,
        sections: [{ name: 'shop:hero', code, uses: ['lib:lenis', 'lib:motion'] }],
      }),
    );
    expect(await tab.evaluate(() => window.__enter)).toBe(0);
    await tab.evaluate(() => window.__lenis?.scrollTo(1400, { duration: 300 }));
    await tab.waitForFunction(() => window.scrollY === 1400);
    await tab.waitForFunction(() => (window.__enter ?? 0) > 0);
    await frames(tab);
    const middle = await opacity(tab);
    expect(middle).toBeGreaterThan(0.2);
    expect(middle).toBeLessThan(0.8);
    expect(errors).toEqual([]);
    await tab.close();
  });

  it('две секции — один экземпляр: настройки задаёт первая, Lenis живёт до ухода последней', async () => {
    const code = `export default { mount(el, ctx) {
      (window.__configured ??= []).push(ctx.lib.lenis.configure({ lerp: 0.2 }));
    } };`;
    const { page: tab, errors } = await openPage(
      browser,
      page(code, {
        body: `${TALL}${section('one')}${section('two')}${TALL}`,
        sections: [
          { name: 'shop:one', code, uses: ['lib:lenis'] },
          { name: 'shop:two', code, uses: ['lib:lenis'] },
        ],
      }),
    );
    expect(await tab.evaluate(() => window.__configured)).toEqual([true, false]);
    expect(await tab.evaluate(() => document.querySelectorAll('html.lenis').length)).toBe(1);
    await tab.evaluate(() => document.querySelector('[data-section-id="one"]')?.remove());
    await frames(tab);
    expect((await htmlState(tab)).lenis).toBe(true);
    await tab.evaluate(() => document.querySelector('[data-section-id="two"]')?.remove());
    await tab.waitForFunction(() => !document.documentElement.classList.contains('lenis'));
    expect(await htmlState(tab)).toMatchObject({ lenis: false, behavior: '' });
    expect(errors).toEqual([]);
    await tab.close();
  });

  const reduced = (options: PageOptions): PageOptions => ({ ...options, reducedMotion: true });
  const still = (options: PageOptions): PageOptions => ({
    ...options,
    mode: 'preview',
    body: options.body.replace('<merfy-section ', '<merfy-section data-merfy-still '),
  });

  it.each([
    ['«уменьшить движение»', reduced],
    ['превью после правки настроек (data-merfy-still)', still],
  ])('%s — Lenis нет, прокрутка нативная: подписка срабатывает, scrollTo сразу', async (_name, change) => {
    const { page: tab, errors } = await openPage(browser, change(page(SMOOTH)));
    expect(await htmlState(tab)).toEqual({ lenis: false, behavior: '', height: '', bodyHeight: '', overflow: '' });
    const at = await tab.evaluate(() => {
      window.__lenis?.scrollTo(1400, { duration: 2000 });
      return window.scrollY;
    });
    expect(at).toBe(1400);
    await tab.waitForFunction(() => (window.__states ?? []).some((state) => state.scroll === 1400));
    expect(await tab.evaluate(() => window.__states?.at(-1))).toMatchObject({
      scroll: 1400,
      limit: 2800,
      direction: 1,
    });
    expect(errors).toEqual([]);
    await tab.close();
  });
});

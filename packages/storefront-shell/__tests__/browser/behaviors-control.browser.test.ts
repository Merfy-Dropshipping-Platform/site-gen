import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPage, type PageOptions } from './behaviors-support';

// ctx.behavior в Chromium (03.11): скрипт секции командует поведениями своей разметки — аккордеон, слайдер, вкладки, окно
// поверх экрана в любом месте страницы. Скрипт отдаёт тесту window.__run: команду зовёт тест, как позвало бы событие.
const RUN = `export default {
  mount(el, ctx) {
    window.__run = window.__run || {};
    window.__run[ctx.id] = (name, command, arg, ref) => ctx.behavior(name, ref ? ctx.ref(ref) : undefined)[command](arg);
    window.__try = window.__try || {};
    window.__try[ctx.id] = (name, command, arg) => {
      try { return ctx.behavior(name)[command](arg); } catch (error) { return { thrown: String(error.message) }; }
    };
  },
};`;

declare global {
  interface Window {
    __run?: Record<string, (name: string, command: string, arg?: unknown, ref?: string) => unknown>;
    __try?: Record<string, (name: string, command: string, arg?: unknown) => unknown>;
  }
}

const FAQ = `<merfy-section data-section="test-ext:faq" data-section-id="faq" style="display:block">
  <div data-behavior="accordion">
    <details name="faq" id="q1"><summary id="s1">Первый</summary><div data-part="content"><p style="margin:0;height:60px">Один</p></div></details>
    <details name="faq" id="q2"><summary>Второй</summary><div data-part="content"><p style="margin:0;height:60px">Два</p></div></details>
    <details id="q3"><summary>Третий</summary><div data-part="content"><p style="margin:0;height:60px">Три</p></div></details>
  </div>
</merfy-section>`;

const SLIDES = `<merfy-section data-section="test-ext:slides" data-section-id="slides" style="display:block">
  <div data-behavior="carousel" data-autoplay="30" id="car">
    <div data-part="viewport" style="overflow:hidden;width:600px"><div data-part="container" style="display:flex">
      <div data-part="slide" style="flex:0 0 100%;height:80px">1</div><div data-part="slide" style="flex:0 0 100%;height:80px">2</div>
      <div data-part="slide" style="flex:0 0 100%;height:80px">3</div>
    </div></div>
    <span data-part="counter" id="counter"></span><button data-part="play" id="play">Пауза</button>
  </div>
</merfy-section>`;

const TABS = `<merfy-section data-section="test-ext:tabs" data-section-id="tabs" style="display:block">
  <div data-behavior="tabs" data-value="a">
    <div data-part="list"><button data-part="trigger" data-value="a">A</button><button data-part="trigger" data-value="b">B</button></div>
    <div data-part="content" data-value="a" id="pa">Панель A</div><div data-part="content" data-value="b" id="pb">Панель B</div>
  </div>
</merfy-section>`;

// Окно: параметры поведения — attributes; внутри кнопка закрытия и поле ввода.
const windowOf = (id: string, attributes: string, size = 'width:320px;height:200px'): string =>
  `<merfy-section data-section="test-ext:${id}" data-section-id="${id}" style="display:block">
  <div data-behavior="dialog" ${attributes}>
    <button data-part="open" id="open-${id}">Открыть</button>
    <dialog data-part="content" id="win-${id}" style="${size}">
      <button data-part="close" id="close-${id}">Закрыть</button><input id="field-${id}" aria-label="Поле">
    </dialog>
  </div>
</merfy-section>`;

const PAGE_TAIL = '<div style="height:3000px"></div>';
const names = (ids: readonly string[]) => ids.map((id) => ({ name: `test-ext:${id}`, code: RUN }));

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

const open = (body: string, ids: readonly string[], extra: Partial<PageOptions> = {}) =>
  openPage(browser, {
    body,
    behaviors: ['accordion', 'carousel', 'tabs', 'dialog'],
    sections: names(ids),
    ...extra,
  });
const run = (page: Page, id: string, name: string, command: string, arg?: unknown, ref?: string): Promise<unknown> =>
  page.evaluate(([a, b, c, d, e]) => window.__run?.[a]?.(b, c, d, e), [id, name, command, arg, ref] as const);
const attempt = (page: Page, id: string, name: string, command: string, arg?: unknown): Promise<unknown> =>
  page.evaluate(([a, b, c, d]) => window.__try?.[a]?.(b, c, d), [id, name, command, arg] as const);
const isOpen = (page: Page, selector: string) => page.$eval(selector, (el) => el.hasAttribute('open'));
const settle = (page: Page) =>
  page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
const locked = (page: Page) => page.evaluate(() => document.documentElement.style.overflow === 'hidden');
const rect = (page: Page, selector: string) =>
  page.$eval(selector, (el) => {
    const { left, top, right, bottom, width, height } = el.getBoundingClientRect();
    return { left, top, right, bottom, width, height };
  });
const OK = { ok: true, data: {} };

describe('ctx.behavior: аккордеон, слайдер, вкладки', () => {
  it('аккордеон: open по номеру и по id, общий name закрывает соседа, close и toggle', async () => {
    const { page, errors } = await open(FAQ, ['faq']);
    expect(await run(page, 'faq', 'accordion', 'open', 0)).toEqual(OK);
    expect(await isOpen(page, '#q1')).toBe(true);
    expect(await run(page, 'faq', 'accordion', 'open', 'q2')).toEqual(OK);
    await page.waitForFunction(() => !document.getElementById('q1')?.hasAttribute('open'));
    expect(await isOpen(page, '#q2')).toBe(true);
    await settle(page);
    expect(await run(page, 'faq', 'accordion', 'toggle', 'q3')).toEqual(OK);
    expect(await isOpen(page, '#q3')).toBe(true);
    await settle(page);
    await run(page, 'faq', 'accordion', 'close', 'q3');
    await page.waitForFunction(() => !document.getElementById('q3')?.hasAttribute('open'));
    expect(await run(page, 'faq', 'accordion', 'open', 'нет-такого')).toMatchObject({
      ok: false,
      error: { code: 'refused' },
    });
    expect(errors).toEqual([]);
    await page.close();
  });

  it('слайдер: next, prev, goTo меняют слайд; goTo за границей — refused; pause и play автопрокрутки', async () => {
    const { page, errors } = await open(SLIDES, ['slides']);
    const counter = () => page.textContent('#counter');
    expect(await counter()).toBe('1');
    expect(await run(page, 'slides', 'carousel', 'next')).toEqual(OK);
    await page.waitForFunction(() => document.getElementById('counter')?.textContent === '2');
    await run(page, 'slides', 'carousel', 'goTo', 2);
    await page.waitForFunction(() => document.getElementById('counter')?.textContent === '3');
    await run(page, 'slides', 'carousel', 'prev');
    await page.waitForFunction(() => document.getElementById('counter')?.textContent === '2');
    expect(await run(page, 'slides', 'carousel', 'goTo', 9)).toMatchObject({ ok: false, error: { code: 'refused' } });
    await run(page, 'slides', 'carousel', 'pause');
    expect(await page.getAttribute('#car', 'data-paused')).toBe('');
    expect(await page.getAttribute('#play', 'aria-pressed')).toBe('true');
    await run(page, 'slides', 'carousel', 'play');
    expect(await page.getAttribute('#car', 'data-paused')).toBeNull();
    expect(errors).toEqual([]);
    await page.close();
  });

  it('слайдер без автопрокрутки: play и pause — refused', async () => {
    const plain = SLIDES.replace(' data-autoplay="30"', '');
    const { page } = await open(plain, ['slides']);
    expect(await run(page, 'slides', 'carousel', 'pause')).toMatchObject({ ok: false, error: { code: 'refused' } });
    await page.close();
  });

  it('вкладки: select открывает панель; неизвестная вкладка — refused', async () => {
    const { page } = await open(TABS, ['tabs']);
    expect(await run(page, 'tabs', 'tabs', 'select', 'b')).toEqual(OK);
    expect(await page.$eval('#pb', (el) => el.hasAttribute('hidden'))).toBe(false);
    expect(await page.$eval('#pa', (el) => el.hasAttribute('hidden'))).toBe(true);
    expect(await run(page, 'tabs', 'tabs', 'select', 'zzz')).toMatchObject({ ok: false, error: { code: 'refused' } });
    await page.close();
  });

  it('в превью команды работают так же', async () => {
    const { page } = await open(TABS, ['tabs'], { mode: 'preview', preview: true });
    expect(await run(page, 'tabs', 'tabs', 'select', 'b')).toEqual(OK);
    expect(await page.$eval('#pb', (el) => el.hasAttribute('hidden'))).toBe(false);
    await page.close();
  });
});

describe('ctx.behavior: окно поверх экрана в секции любого блока', () => {
  it('center: модальное, затемнение, фокус внутри, запрет прокрутки; Esc закрывает и отпускает страницу', async () => {
    const body = `<header>${windowOf('promo', 'data-position="center"')}</header>${PAGE_TAIL}`;
    const { page, errors } = await open(body, ['promo']);
    expect(await run(page, 'promo', 'dialog', 'open')).toEqual(OK);
    expect(await page.$eval('#win-promo', (el) => el.matches(':modal'))).toBe(true);
    expect(await page.getAttribute('#win-promo', 'data-merfy-position')).toBe('center');
    expect(await page.$eval('#win-promo', (el) => getComputedStyle(el, '::backdrop').backgroundColor)).toBe(
      'rgba(0, 0, 0, 0.5)',
    );
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('close-promo');
    expect(await locked(page)).toBe(true);
    const box = await rect(page, '#win-promo');
    expect(Math.round(box.left + box.width / 2)).toBe(640);
    expect(Math.round(box.top + box.height / 2)).toBe(400);
    await settle(page);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('win-promo')?.hasAttribute('open'));
    expect(await locked(page)).toBe(false);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('sheet: шторка внизу во всю ширину; corner: немодальное окно в углу, страница не заперта', async () => {
    // Размер окна задают его классы, у шторки без ширины ядро ставит всю ширину.
    const body = `${windowOf('sheet', 'data-position="sheet"', 'height:200px')}${windowOf('corner', 'data-position="corner"')}${PAGE_TAIL}`;
    const { page } = await open(body, ['sheet', 'corner']);
    await run(page, 'sheet', 'dialog', 'open');
    await settle(page);
    const sheet = await rect(page, '#win-sheet');
    expect([sheet.left, sheet.right, sheet.bottom]).toEqual([0, 1280, 800]);
    await run(page, 'sheet', 'dialog', 'close');
    await page.waitForFunction(() => !document.getElementById('win-sheet')?.hasAttribute('open'));
    await run(page, 'corner', 'dialog', 'open');
    expect(await page.$eval('#win-corner', (el) => el.matches(':modal'))).toBe(false);
    expect(await isOpen(page, '#win-corner')).toBe(true);
    expect(await locked(page)).toBe(false);
    await settle(page);
    const corner = await rect(page, '#win-corner');
    expect([corner.right, corner.bottom]).toEqual([1264, 784]);
    await page.close();
  });

  it('corner на телефоне — шторкой снизу во всю ширину', async () => {
    const body = `${windowOf('corner', 'data-position="corner"', 'height:200px')}${PAGE_TAIL}`;
    const { page } = await open(body, ['corner'], { viewport: { width: 390, height: 800 } });
    await run(page, 'corner', 'dialog', 'open');
    await settle(page);
    const box = await rect(page, '#win-corner');
    expect([box.left, box.right, box.bottom]).toEqual([0, 390, 800]);
    await page.close();
  });

  it('место из команды: без data-position окно ставится в угол слева на один раз; кнопка открывает по разметке', async () => {
    const body = `${windowOf('plain', 'data-transition="fade"')}${PAGE_TAIL}`;
    const { page } = await open(body, ['plain']);
    expect(await run(page, 'plain', 'dialog', 'open', { position: 'corner', side: 'left' })).toEqual(OK);
    expect(await page.getAttribute('#win-plain', 'data-merfy-side')).toBe('left');
    expect((await rect(page, '#win-plain')).left).toBe(16);
    expect(await page.$eval('#win-plain', (el) => el.matches(':modal'))).toBe(false);
    await run(page, 'plain', 'dialog', 'close');
    await page.waitForFunction(() => !document.getElementById('win-plain')?.hasAttribute('open'));
    await page.click('#open-plain');
    expect(await page.getAttribute('#win-plain', 'data-merfy-position')).toBeNull();
    expect(await page.$eval('#win-plain', (el) => el.matches(':modal'))).toBe(true);
    await page.close();
  });

  it('backdrop: false — без затемнения, клик мимо окна всё равно закрывает', async () => {
    const body = `${windowOf('promo', 'data-position="center"')}${PAGE_TAIL}`;
    const { page } = await open(body, ['promo']);
    await run(page, 'promo', 'dialog', 'open', { backdrop: false });
    expect(await page.$eval('#win-promo', (el) => getComputedStyle(el, '::backdrop').backgroundColor)).toBe(
      'rgba(0, 0, 0, 0)',
    );
    await settle(page);
    await page.mouse.click(5, 5);
    await page.waitForFunction(() => !document.getElementById('win-promo')?.hasAttribute('open'));
    await page.close();
  });

  it('модальное окно на странице одно: второе open — refused, после закрытия первого открывается', async () => {
    const body = `${windowOf('one', 'data-position="center"')}${windowOf('two', 'data-position="sheet"')}${PAGE_TAIL}`;
    const { page } = await open(body, ['one', 'two']);
    expect(await run(page, 'one', 'dialog', 'open')).toEqual(OK);
    const second = await run(page, 'two', 'dialog', 'open');
    expect(second).toMatchObject({ ok: false, error: { code: 'refused' } });
    expect(await isOpen(page, '#win-two')).toBe(false);
    expect(await locked(page)).toBe(true);
    await settle(page);
    await run(page, 'one', 'dialog', 'close');
    await page.waitForFunction(() => !document.getElementById('win-one')?.hasAttribute('open'));
    expect(await run(page, 'two', 'dialog', 'open')).toEqual(OK);
    expect(await isOpen(page, '#win-two')).toBe(true);
    await page.close();
  });

  it('угловое окно может стоять рядом с модальным', async () => {
    const body = `${windowOf('one', 'data-position="center"')}${windowOf('bar', 'data-position="corner"')}${PAGE_TAIL}`;
    const { page } = await open(body, ['one', 'bar']);
    await run(page, 'one', 'dialog', 'open');
    expect(await run(page, 'bar', 'dialog', 'open')).toEqual(OK);
    expect(await isOpen(page, '#win-bar')).toBe(true);
    await page.close();
  });

  it('неверное место — invalid, окно не открывается; toggle и повторный open — ok', async () => {
    const body = `${windowOf('promo', 'data-position="center"')}${PAGE_TAIL}`;
    const { page, errors } = await open(body, ['promo']);
    expect(await run(page, 'promo', 'dialog', 'open', { position: 'left' })).toMatchObject({
      ok: false,
      error: { code: 'invalid' },
    });
    expect(await run(page, 'promo', 'dialog', 'open', { position: 'corner', backdrop: true })).toMatchObject({
      ok: false,
      error: { code: 'invalid' },
    });
    expect(await isOpen(page, '#win-promo')).toBe(false);
    expect(errors.filter((text) => text.startsWith('ctx.behavior("dialog").open'))).toHaveLength(2);
    expect(await run(page, 'promo', 'dialog', 'toggle')).toEqual(OK);
    expect(await run(page, 'promo', 'dialog', 'open')).toEqual(OK);
    expect(await isOpen(page, '#win-promo')).toBe(true);
    await page.close();
  });

  it('«уменьшить движение» — окно появляется и пропадает без анимаций', async () => {
    const body = `${windowOf('promo', 'data-position="center"')}${PAGE_TAIL}`;
    const { page } = await open(body, ['promo'], { reducedMotion: true });
    await run(page, 'promo', 'dialog', 'open');
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    await run(page, 'promo', 'dialog', 'close');
    expect(await isOpen(page, '#win-promo')).toBe(false);
    expect(await locked(page)).toBe(false);
    await page.close();
  });

  it('появление: прозрачность и сдвиг за 200 мс, уход — за 150 мс', async () => {
    const body = `${windowOf('promo', 'data-position="center"')}${PAGE_TAIL}`;
    const { page } = await open(body, ['promo']);
    const shown = await page.evaluate(() => {
      window.__run?.promo?.('dialog', 'open');
      return window.__readAnimations?.('#win-promo', null).flat().map((a) => a.duration);
    });
    expect(shown).toContain(200);
    await settle(page);
    const hidden = await page.evaluate(() => {
      window.__run?.promo?.('dialog', 'close');
      return window.__readAnimations?.('#win-promo', null).flat().map((a) => a.duration);
    });
    expect(hidden).toContain(150);
    await page.close();
  });

  it('в превью окно открывается командой так же', async () => {
    const body = `${windowOf('promo', 'data-position="center"')}${PAGE_TAIL}`;
    const { page } = await open(body, ['promo'], { mode: 'preview', preview: true });
    expect(await run(page, 'promo', 'dialog', 'open')).toEqual(OK);
    expect(await page.$eval('#win-promo', (el) => el.matches(':modal'))).toBe(true);
    await page.close();
  });

  it('ошибка кода секции: нет такого поведения в разметке — исключение, секция помечена сбоем, страница живёт', async () => {
    const body = `${FAQ}${PAGE_TAIL}`;
    const { page } = await open(body, ['faq']);
    expect(await attempt(page, 'faq', 'dialog', 'open')).toEqual({
      thrown: 'ctx.behavior("dialog"): в разметке секции нет data-behavior="dialog"',
    });
    expect(await page.$eval('#s1', (el) => el.tagName)).toBe('SUMMARY');
    await page.close();
  });
});

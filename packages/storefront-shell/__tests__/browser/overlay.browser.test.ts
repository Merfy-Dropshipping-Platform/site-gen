import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { animations, openPage, type PageOptions } from './behaviors-support';

// Окна поверх страницы в Chromium (01.11): верхний слой popover, по центру / в углу / шторкой, подложка с затемнением и без,
// фокус внутрь и по кругу на Tab, Esc, возврат фокуса, запрет прокрутки, одно модальное окно, «уменьшить движение»,
// угол на телефоне — шторкой снизу. Скрипт секции кладёт свой ctx в window.__ctx — так тест зовёт ctx.overlay.
declare global {
  interface Window {
    __ctx?: Record<string, { overlay: { open(options?: unknown): unknown; close(): unknown } | null }>;
    __closed?: unknown[];
  }
}

const SECTION = {
  name: 'shop:promo',
  code: `export default { mount(el, ctx) { (window.__ctx ??= {})[ctx.id] = ctx; } };`,
};

// Секция поверх страницы — как её рисует сборка: data-overlay и hidden; ширину и фон окна задаёт шаблон секции.
const promo = (id: string): string =>
  `<merfy-section data-section="shop:promo" data-section-id="${id}" data-overlay hidden>
  <div style="width:320px;background:#fff"><h2>Скидка 10%</h2><input id="${id}-email" aria-label="Почта">
  <button id="${id}-ok">Подписаться</button><button data-action="overlay.close" id="${id}-close" aria-label="Закрыть">×</button></div>
</merfy-section>`;

const BODY = `<button id="outside">До окна</button><div style="height:3000px"></div>${promo('a')}${promo('b')}${promo('c')}`;
const LOG = `window.__closed = []; document.addEventListener('merfy:overlay:close', (e) => window.__closed.push(e.detail));`;

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

async function open(options: Partial<PageOptions> = {}) {
  return openPage(browser, { body: BODY, sections: [SECTION], core: ['overlay'], beforeCore: LOG, ...options });
}

const call = (page: Page, id: string, method: 'open' | 'close', options?: unknown) =>
  page.evaluate(([i, m, o]): unknown => JSON.parse(JSON.stringify(window.__ctx?.[i]?.overlay?.[m](o) ?? null)), [
    id,
    method,
    options,
  ] as const);

const isOpen = (page: Page, id: string) =>
  page.$eval(`[data-section-id="${id}"]`, (el) => el.matches(':popover-open') && !el.hasAttribute('hidden'));
const active = (page: Page) => page.evaluate(() => document.activeElement?.id ?? '');
// Размер — после анимации появления: в её начале окно чуть уменьшено (под нагрузкой машины замер попадал на неё).
const rect = (page: Page, id: string) =>
  page.$eval(`[data-section-id="${id}"]`, async (el) => {
    await Promise.all(el.getAnimations().map((animation) => animation.finished));
    const box = el.getBoundingClientRect();
    return {
      left: Math.round(box.left),
      right: Math.round(box.right),
      bottom: Math.round(box.bottom),
      width: Math.round(box.width),
    };
  });
// Окно, которое видит посетитель, — корень шаблона внутри слоя места; замер тоже после анимации слоя.
const windowRect = (page: Page, id: string) =>
  page.$eval(`[data-section-id="${id}"] > *`, async (el) => {
    await Promise.all((el.parentElement?.getAnimations() ?? []).map((animation) => animation.finished));
    const box = el.getBoundingClientRect();
    return {
      left: Math.round(box.left),
      right: Math.round(box.right),
      top: Math.round(box.top),
      bottom: Math.round(box.bottom),
      width: Math.round(box.width),
    };
  });
const reasons = (page: Page) =>
  page.evaluate(() => (window.__closed ?? []).map((detail): unknown => Reflect.get(Object(detail), 'reason')));

describe('окно по центру', () => {
  it('закрыто, пока скрипт не вызвал open(); open — верхний слой, role="dialog", aria-modal, фокус на первом поле', async () => {
    const { page, errors } = await open();
    expect(await page.$eval('[data-section-id="a"]', (el) => el.getBoundingClientRect().height)).toBe(0);
    await page.focus('#outside');
    expect(await call(page, 'a', 'open')).toEqual({ ok: true, data: {} });
    expect(await isOpen(page, 'a')).toBe(true);
    const attrs = await page.$eval('[data-section-id="a"]', (el) => [
      el.getAttribute('role'),
      el.getAttribute('aria-modal'),
    ]);
    expect(attrs).toEqual(['dialog', 'true']);
    expect(await active(page)).toBe('a-email');
    const box = await windowRect(page, 'a');
    expect([box.left, box.right]).toEqual([(1280 - 320) / 2, (1280 + 320) / 2]);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('Tab и Shift+Tab — по кругу внутри окна; Esc закрывает, фокус возвращается; прокрутка заперта и отперта', async () => {
    const { page } = await open({ reducedMotion: true });
    await page.focus('#outside');
    await call(page, 'a', 'open');
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden');
    await page.keyboard.press('Shift+Tab');
    expect(await active(page)).toBe('a-close');
    await page.keyboard.press('Tab');
    expect(await active(page)).toBe('a-email');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    expect(await active(page)).toBe('a-email');
    await page.keyboard.press('Escape');
    expect(await isOpen(page, 'a')).toBe(false);
    expect(await active(page)).toBe('outside');
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');
    expect(await reasons(page)).toEqual(['escape']);
    await page.close();
  });

  it('подложка: затемнение и без него; клик мимо окна закрывает, страница под окном клика не получает', async () => {
    const { page } = await open({ reducedMotion: true });
    await page.evaluate(() => {
      document.getElementById('outside')?.addEventListener('click', () => window.__closed?.push('outside-click'));
    });
    await call(page, 'a', 'open');
    const dim = await page.$eval('[data-merfy-overlay-backdrop]', (el) => getComputedStyle(el).backgroundColor);
    expect(dim).toBe('rgba(0, 0, 0, 0.5)');
    await page.mouse.click(20, 15);
    expect(await isOpen(page, 'a')).toBe(false);
    await call(page, 'a', 'open', { backdrop: false });
    const clear = await page.$eval('[data-merfy-overlay-backdrop]', (el) => getComputedStyle(el).backgroundColor);
    expect(clear).toBe('rgba(0, 0, 0, 0)');
    await page.click('#a-close');
    expect(await reasons(page)).toEqual(['backdrop', 'button']);
    await page.close();
  });

  it('второе модальное окно — refused, первое открыто; после закрытия первого — открывается', async () => {
    const { page } = await open({ reducedMotion: true });
    await call(page, 'a', 'open');
    expect(await call(page, 'b', 'open', { position: 'sheet' })).toMatchObject({
      ok: false,
      error: { code: 'refused' },
    });
    expect([await isOpen(page, 'a'), await isOpen(page, 'b')]).toEqual([true, false]);
    await call(page, 'a', 'close');
    expect(await call(page, 'b', 'open')).toEqual({ ok: true, data: {} });
    await page.close();
  });
});

describe('угол и шторка', () => {
  it('угол — немодальный: фокус не уходит, страница работает, рядом с модальным; справа внизу', async () => {
    const { page } = await open({ reducedMotion: true });
    await page.focus('#outside');
    await call(page, 'c', 'open', { position: 'corner' });
    expect(await active(page)).toBe('outside');
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');
    const box = await rect(page, 'c');
    expect([box.right, box.bottom]).toEqual([1280 - 16, 800 - 16]);
    await page.click('#outside');
    expect(await isOpen(page, 'c')).toBe(true);
    await call(page, 'a', 'open');
    expect([await isOpen(page, 'a'), await isOpen(page, 'c')]).toEqual([true, true]);
    await page.close();
  });

  it('шторка — внизу во всю ширину; угол на телефоне — тоже шторкой снизу', async () => {
    const { page } = await open({ reducedMotion: true, viewport: { width: 375, height: 700 } });
    await call(page, 'a', 'open', { position: 'sheet' });
    expect(await rect(page, 'a')).toMatchObject({ left: 0, width: 375, bottom: 700 });
    await call(page, 'a', 'close');
    await call(page, 'c', 'open', { position: 'corner' });
    expect(await rect(page, 'c')).toMatchObject({ left: 0, width: 375, bottom: 700 });
    await page.close();
  });
});

// Ширина окна — классами корня шаблона, как пишет автор (живая проверка #431: w-full max-w-md давало окно по содержимому).
// Классы — в @layer utilities, как Tailwind сборки; py-section — общая настройка «Отступы» на обёртке.
const UTILITIES = `@layer theme, base, components, utilities;
@layer utilities { .w-full { width: 100% } .max-w-md { max-width: 28rem } .bg-white { background: #fff } .py-section { padding-block: 4rem } }`;
const sized = (id: string): string =>
  `<merfy-section data-section="shop:promo" data-section-id="${id}" data-overlay hidden class="py-section">
  <div class="w-full max-w-md bg-white"><h2 id="${id}-title">Скидка 10%</h2><button id="${id}-ok">Забрать</button></div>
</merfy-section>`;
const SIZED_BODY = `<button id="outside" style="position:fixed;left:24px;bottom:24px">Под окном</button>${sized('w')}`;
const PAGE_CLICKS = `window.__clicks = 0; addEventListener('DOMContentLoaded', () =>
  document.getElementById('outside').addEventListener('click', () => { window.__clicks += 1; }));`;
const pageClicks = (page: Page) => page.evaluate((): unknown => Reflect.get(window, '__clicks'));
const openSized = (options: Partial<PageOptions> = {}) =>
  open({ body: SIZED_BODY, css: UTILITIES, reducedMotion: true, beforeCore: `${LOG}${PAGE_CLICKS}`, ...options });

describe('ширина окна по классам шаблона', () => {
  it('по центру: w-full max-w-md — 28rem посередине экрана; на телефоне — экран минус поля 16px', async () => {
    const { page, errors } = await openSized();
    await call(page, 'w', 'open');
    const box = await windowRect(page, 'w');
    expect([box.left, box.width, box.right]).toEqual([(1280 - 448) / 2, 448, (1280 + 448) / 2]);
    expect(Math.abs(box.top + box.bottom - 800)).toBeLessThanOrEqual(1);
    await page.close();
    const phone = await openSized({ viewport: { width: 375, height: 700 } });
    await call(phone.page, 'w', 'open');
    expect(await windowRect(phone.page, 'w')).toMatchObject({ left: 16, width: 375 - 32 });
    expect(errors).toEqual([]);
    await phone.page.close();
  });

  it('по центру: клик рядом с окном закрывает его (backdrop), клик по окну — нет; страница под ним не нажимается', async () => {
    const { page } = await openSized();
    for (const backdrop of [true, false]) {
      await call(page, 'w', 'open', { backdrop });
      await page.click('#w-title');
      expect(await isOpen(page, 'w')).toBe(true);
      await page.mouse.click(40, 800 - 34);
      expect(await isOpen(page, 'w')).toBe(false);
    }
    expect(await reasons(page)).toEqual(['backdrop', 'backdrop']);
    expect(await pageClicks(page)).toBe(0);
    await page.close();
  });

  it('шторка — корень во всю ширину и при max-w-md; угол — 28rem справа, страница рядом с окном нажимается', async () => {
    const { page } = await openSized();
    await call(page, 'w', 'open', { position: 'sheet' });
    expect(await windowRect(page, 'w')).toMatchObject({ left: 0, width: 1280, bottom: 800 });
    await call(page, 'w', 'close');
    await call(page, 'w', 'open', { position: 'corner' });
    expect(await windowRect(page, 'w')).toMatchObject({ width: 448, right: 1280 - 16, bottom: 800 - 16 });
    await page.mouse.click(40, 800 - 34);
    expect(await pageClicks(page)).toBe(1);
    expect(await isOpen(page, 'w')).toBe(true);
    await call(page, 'w', 'close');
    await call(page, 'w', 'open', { position: 'corner', side: 'left' });
    expect(await windowRect(page, 'w')).toMatchObject({ left: 16, width: 448 });
    await page.close();
  });
});

describe('движение', () => {
  it('переход окна и подложки — 200 мс; «уменьшить движение» — без анимаций', async () => {
    const moving = await open();
    await call(moving.page, 'a', 'open');
    const [run] = await animations(moving.page, '[data-section-id="a"]');
    expect(run?.duration).toBe(200);
    const [fade] = await animations(moving.page, '[data-merfy-overlay-backdrop]');
    expect(fade?.duration).toBe(200);
    await moving.page.close();
    const still = await open({ reducedMotion: true });
    await call(still.page, 'a', 'open');
    expect(await animations(still.page, '[data-section-id="a"]')).toEqual([null]);
    await still.page.close();
  });
});

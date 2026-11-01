import { chromium, type Browser, type CDPSession, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPage, type OpenedPage } from './behaviors-support';

// Поведение scratch в Chromium: слой поверх элемента, который стирают курсором или пальцем. Слой — canvas ядра; страница
// под пальцем не прокручивается; больше половины стёртого — слой убран и уходит merfy:scratch:done; кнопка «Показать»
// убирает слой с клавиатуры; «уменьшить движение» — слой исчезает сразу, без затухания.
const CARD = `<merfy-section data-section="shop:promo" data-section-id="s1" style="display:block">
  <div id="card" data-behavior="scratch" data-color="#888888" style="position:relative;width:300px;height:200px">
    <span id="secret" style="display:block;padding:80px 0;text-align:center">SALE-2026</span>
    <button type="button" id="reveal" data-part="reveal" style="position:absolute;right:0;bottom:0;z-index:2;width:70px;height:24px">Показать</button>
  </div>
</merfy-section>
<div id="plain" style="height:3000px;background:#eee">ниже</div>`;

// Событие слушаем со старта страницы: код тестов не успел бы подписаться после загрузки.
const CATCH = `window.__done = []; document.addEventListener('merfy:scratch:done', (event) => window.__done.push(event.detail));`;

declare global {
  interface Window {
    __done?: unknown[];
  }
}

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

const open = (options: { touch?: boolean; reducedMotion?: boolean } = {}): Promise<OpenedPage> =>
  openPage(browser, {
    body: CARD,
    behaviors: ['scratch'],
    beforeCore: CATCH,
    viewport: options.touch ? { width: 390, height: 800 } : { width: 1280, height: 800 },
    ...options,
  });

// Доля стёртого: прозрачные пиксели canvas.
const cleared = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return -1;
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let clear = 0;
    for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 255) === 0) clear += 1;
    return clear / (canvas.width * canvas.height);
  });

const alphaAt = (page: Page, x: number, y: number): Promise<number> =>
  page.evaluate(
    ([px, py]) =>
      document
        .querySelector('canvas')
        ?.getContext('2d')
        ?.getImageData(px ?? 0, py ?? 0, 1, 1).data[3] ?? -1,
    [x, y] as const,
  );

const done = (page: Page): Promise<unknown[]> => page.evaluate(() => window.__done ?? []);
const hasCanvas = (page: Page): Promise<boolean> => page.evaluate(() => document.querySelector('canvas') !== null);

// Полоса мышью слева направо на высоте y внутри карточки (карточка в левом верхнем углу страницы).
async function mouseRow(page: Page, y: number): Promise<void> {
  await page.mouse.move(5, y);
  await page.mouse.down();
  await page.mouse.move(295, y, { steps: 15 });
  await page.mouse.up();
}

describe('слой', () => {
  it('поверх элемента, цвет из data-color, скрыт от экранных читалок; цвет на месте до первого касания', async () => {
    const { page, errors } = await open();
    const info = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const box = canvas?.getBoundingClientRect();
      const style = canvas ? getComputedStyle(canvas) : null;
      return {
        parent: canvas?.parentElement?.id,
        size: [box?.width, box?.height],
        position: style?.position,
        touchAction: style?.touchAction,
        hidden: canvas?.getAttribute('aria-hidden'),
        pixel: Array.from(canvas?.getContext('2d')?.getImageData(150, 100, 1, 1).data ?? []),
      };
    });
    expect(info).toEqual({
      parent: 'card',
      size: [300, 200],
      position: 'absolute',
      touchAction: 'none',
      hidden: 'true',
      pixel: [136, 136, 136, 255],
    });
    expect(await cleared(page)).toBe(0);
    expect(errors).toEqual([]);
  });
});

describe('стирание мышью', () => {
  it('под курсором стирается, остальное цело; пока меньше половины, слой на месте и события нет', async () => {
    const { page } = await open();
    await mouseRow(page, 40);
    expect(await alphaAt(page, 150, 40)).toBe(0);
    expect(await alphaAt(page, 150, 150)).toBe(255);
    expect(await cleared(page)).toBeGreaterThan(0.1);
    expect(await cleared(page)).toBeLessThan(0.5);
    expect(await hasCanvas(page)).toBe(true);
    expect(await done(page)).toEqual([]);
  });

  it('без нажатия курсор не стирает', async () => {
    const { page } = await open();
    await page.mouse.move(5, 100);
    await page.mouse.move(295, 100, { steps: 15 });
    expect(await cleared(page)).toBe(0);
  });

  it('больше половины стёртого: слой убран, одно событие с секцией, кнопка «Показать» скрыта', async () => {
    const { page, errors } = await open();
    const shares: number[] = [];
    for (const y of [20, 48, 76, 104]) {
      await mouseRow(page, y);
      const share = await cleared(page);
      if (share >= 0) shares.push(share);
      if (share >= 0 && share < 0.45) expect(await done(page), `стёрто ${share}`).toEqual([]);
    }
    await page.waitForFunction(() => document.querySelector('canvas') === null);
    expect(shares[0]).toBeLessThan(0.2);
    expect(shares.some((share) => share >= 0.5)).toBe(true);
    expect(await done(page)).toEqual([{ section: 'shop:promo', id: 's1' }]);
    expect(await page.evaluate(() => document.getElementById('reveal')?.hidden)).toBe(true);
    expect(await page.evaluate(() => document.getElementById('secret')?.textContent)).toBe('SALE-2026');
    expect(errors).toEqual([]);
  });

  it('после того как слой убран, событие не повторяется', async () => {
    const { page } = await open();
    for (const y of [20, 48, 76, 104]) await mouseRow(page, y);
    await page.waitForFunction(() => document.querySelector('canvas') === null);
    await mouseRow(page, 150);
    expect(await done(page)).toHaveLength(1);
  });
});

describe('стирание пальцем', () => {
  async function touchDrag(
    cdp: CDPSession,
    from: readonly [number, number],
    to: readonly [number, number],
  ): Promise<void> {
    const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', point?: readonly [number, number]): Promise<unknown> =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: point === undefined ? [] : [{ x: point[0], y: point[1] }],
      });
    await send('touchStart', from);
    const steps = 12;
    for (let i = 1; i <= steps; i += 1) {
      await send('touchMove', [from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps]);
    }
    await send('touchEnd');
  }

  it('палец стирает слой, а страница под ним не прокручивается', async () => {
    const { page } = await open({ touch: true });
    const cdp = await page.context().newCDPSession(page);
    await touchDrag(cdp, [150, 190], [150, 10]); // жест, которым прокручивают страницу: палец вверх
    expect(await alphaAt(page, 150, 100)).toBe(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(await cleared(page)).toBeGreaterThan(0.1);
  });

  it('тот же жест вне слоя прокручивает страницу — проверка рабочая', async () => {
    const { page } = await open({ touch: true });
    const cdp = await page.context().newCDPSession(page);
    await touchDrag(cdp, [150, 500], [150, 300]);
    await page.waitForFunction(() => window.scrollY > 0);
  });

  it('пальцем стёрто больше половины: слой убран, событие', async () => {
    const { page } = await open({ touch: true });
    const cdp = await page.context().newCDPSession(page);
    for (const y of [20, 48, 76, 104]) await touchDrag(cdp, [5, y], [295, y]);
    await page.waitForFunction(() => document.querySelector('canvas') === null);
    expect(await done(page)).toHaveLength(1);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
});

describe('кнопка «Показать»', () => {
  it('с клавиатуры: фокус, Enter — слой убран, событие', async () => {
    const { page } = await open();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('reveal');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('canvas') === null);
    expect(await done(page)).toEqual([{ section: 'shop:promo', id: 's1' }]);
    expect(await page.evaluate(() => document.getElementById('reveal')?.hidden)).toBe(true);
  });

  it('кнопка над слоем: по ней можно нажать мышью', async () => {
    const { page } = await open();
    await page.click('#reveal');
    await page.waitForFunction(() => document.querySelector('canvas') === null);
    expect(await done(page)).toHaveLength(1);
  });
});

describe('«уменьшить движение»', () => {
  it('обычно слой гаснет за долю секунды; при «уменьшить движение» исчезает сразу, без анимации', async () => {
    const normal = await open();
    const fading = await normal.page.evaluate(() => {
      document.getElementById('reveal')?.click();
      const canvas = document.querySelector('canvas');
      return canvas === null ? -1 : canvas.getAnimations().length;
    });
    expect(fading).toBeGreaterThan(0);
    await normal.page.waitForFunction(() => document.querySelector('canvas') === null);

    const reduced = await open({ reducedMotion: true });
    const state = await reduced.page.evaluate(() => {
      document.getElementById('reveal')?.click();
      return { canvas: document.querySelector('canvas') !== null, animations: document.getAnimations().length };
    });
    expect(state).toEqual({ canvas: false, animations: 0 });
    expect(await done(reduced.page)).toHaveLength(1);
  });
});

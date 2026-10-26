import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPage } from './behaviors-support';

// Мелкие поведения в Chromium (design.md блока 6, раздел 8; блок 7, п. 14): количество, фото карточки, шапка при
// прокрутке, видео.
const QUANTITY = `<merfy-section data-section="shop:product" data-section-id="p1" style="display:block">
  <div data-behavior="quantity"><button data-part="minus" id="minus">−</button>
    <input data-part="input" type="number" min="1" max="3" value="1" id="q" aria-label="Количество"><button data-part="plus" id="plus">+</button></div>
</merfy-section>`;

const card = (
  photos: string,
): string => `<merfy-section data-section="shop:catalog" data-section-id="c1" style="display:block">
  <a href="#product" data-behavior="card-photos" data-photos="${photos}" id="card" style="display:block;width:300px;height:400px">
    <img data-part="image" src="/p/1.jpg" alt="Шарф" id="img" style="width:300px;height:400px"></a>
</merfy-section><div style="height:2000px"></div>`;

const HEADER = `<merfy-section data-section="shop:header" data-section-id="header" data-behavior="sticky-header" data-mode="scroll-up" id="header"
  style="display:block;position:sticky;top:0;height:80px">Шапка</merfy-section><div style="height:5000px"></div>`;

const VIDEO = `<merfy-section data-section="shop:video" data-section-id="v1" style="display:block">
  <div data-behavior="video"><video data-part="video" id="video" muted></video><button data-part="play" id="play">Смотреть</button></div>
</merfy-section>`;

// Видео без файла: play и pause только меняют paused и отправляют события, как браузер.
const FAKE_MEDIA = `
Object.defineProperty(HTMLMediaElement.prototype, 'paused', { configurable: true, get() { return this.__paused !== false; } });
HTMLMediaElement.prototype.play = function () { this.__paused = false; this.dispatchEvent(new Event('play')); return Promise.resolve(); };
HTMLMediaElement.prototype.pause = function () { this.__paused = true; this.dispatchEvent(new Event('pause')); };`;

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

const src = (page: Page) => page.getAttribute('#img', 'src');
const disabled = (page: Page, id: string) => page.$eval(`#${id}`, (el) => el.matches(':disabled'));

// Свайп: pointerdown, pointermove, pointerup с нужным pointerType; cancel — жест отдан прокрутке.
async function swipe(page: Page, dx: number, dy: number, pointerType: 'touch' | 'mouse' = 'touch'): Promise<void> {
  await page.evaluate(
    ([x, y, type]) => {
      const target = document.getElementById('img');
      const send = (kind: string, clientX: number, clientY: number): void => {
        target?.dispatchEvent(
          new PointerEvent(kind, {
            bubbles: true,
            cancelable: true,
            pointerType: type,
            isPrimary: true,
            pointerId: 7,
            clientX,
            clientY,
            buttons: type === 'mouse' ? 1 : 0,
          }),
        );
      };
      send('pointerdown', 200, 200);
      send('pointermove', 200 + x / 2, 200 + y / 2);
      send('pointermove', 200 + x, 200 + y);
      send('pointerup', 200 + x, 200 + y);
    },
    [dx, dy, pointerType] as const,
  );
}

// Прокрутка забрала жест: pointercancel, палец отпущен позже — pointerup.
async function swipeCancelled(page: Page, dx: number, dy: number): Promise<void> {
  await page.evaluate(
    ([x, y]) => {
      const target = document.getElementById('img');
      const send = (kind: string, clientX: number, clientY: number): void => {
        target?.dispatchEvent(
          new PointerEvent(kind, {
            bubbles: true,
            cancelable: true,
            pointerType: 'touch',
            isPrimary: true,
            pointerId: 7,
            clientX,
            clientY,
          }),
        );
      };
      send('pointerdown', 200, 200);
      send('pointermove', 200 + x / 2, 200 + y / 2);
      send('pointercancel', 200 + x / 2, 200 + y / 2);
      send('pointerup', 200 + x, 200 + y);
    },
    [dx, dy] as const,
  );
}

describe('quantity', () => {
  it('минус и плюс — stepDown и stepUp с событиями input и change; на границе кнопка недоступна', async () => {
    const { page, errors } = await openPage(browser, { body: QUANTITY, behaviors: ['quantity'] });
    await page.evaluate(() => {
      const input = document.getElementById('q');
      const counts = { input: 0, change: 0 };
      input?.addEventListener('input', () => (counts.input += 1));
      input?.addEventListener('change', () => (counts.change += 1));
      window.__counts = counts;
    });
    expect([await disabled(page, 'minus'), await disabled(page, 'plus')]).toEqual([true, false]);
    await page.click('#plus');
    await page.click('#plus');
    expect(await page.inputValue('#q')).toBe('3');
    expect(await page.evaluate(() => window.__counts)).toEqual({
      input: 2,
      change: 2,
    });
    expect([await disabled(page, 'minus'), await disabled(page, 'plus')]).toEqual([false, true]);
    await page.fill('#q', '1');
    expect(await disabled(page, 'minus')).toBe(true);
    expect(errors).toEqual([]);
    await page.close();
  });
});

describe('card-photos', () => {
  it('мышь: при наведении второе фото, при уходе — первое; hover-next="false" — без смены', async () => {
    const { page } = await openPage(browser, { body: card('/p/1.jpg /p/2.jpg /p/3.jpg'), behaviors: ['cardPhotos'] });
    await page.hover('#img');
    expect(await src(page)).toBe('/p/2.jpg');
    await page.mouse.move(900, 700);
    expect(await src(page)).toBe('/p/1.jpg');
    await page.close();
    const off = await openPage(browser, {
      body: card('/p/1.jpg /p/2.jpg').replace('data-behavior', 'data-hover-next="false" data-behavior'),
      behaviors: ['cardPhotos'],
    });
    await off.page.hover('#img');
    expect(await src(off.page)).toBe('/p/1.jpg');
    await off.page.close();
  });

  it('свайп от 30 px по горизонтали: следующее и предыдущее фото, без перехода с последнего на первое', async () => {
    const { page } = await openPage(browser, { body: card('/p/1.jpg /p/2.jpg /p/3.jpg'), behaviors: ['cardPhotos'] });
    await swipe(page, -60, 10);
    expect(await src(page)).toBe('/p/2.jpg');
    await swipe(page, -60, 0);
    await swipe(page, -60, 0);
    expect(await src(page)).toBe('/p/3.jpg');
    await swipe(page, 60, 0);
    expect(await src(page)).toBe('/p/2.jpg');
    await swipe(page, -20, 0);
    await swipe(page, -40, 35);
    expect(await src(page)).toBe('/p/2.jpg');
    await page.close();
  });

  it('после свайпа нажатие 400 мс не срабатывает, потом — переход по ссылке', async () => {
    const { page } = await openPage(browser, { body: card('/p/1.jpg /p/2.jpg'), behaviors: ['cardPhotos'] });
    await swipe(page, -60, 0);
    await page.evaluate(() => document.getElementById('card')?.click());
    expect(await page.evaluate(() => location.hash)).toBe('');
    await page.waitForTimeout(450);
    await page.evaluate(() => document.getElementById('card')?.click());
    expect(await page.evaluate(() => location.hash)).toBe('#product');
    await page.close();
  });

  it('адрес фото проверяется как src картинки: javascript: не ставится', async () => {
    const { page } = await openPage(browser, { body: card('/p/1.jpg javascript:alert(1)'), behaviors: ['cardPhotos'] });
    await page.hover('#img');
    await swipe(page, -60, 0);
    expect(await src(page)).toBe('/p/1.jpg');
    await page.close();
  });

  it('мышью с зажатием: свайп листает фото, после него нажатие 400 мс не срабатывает', async () => {
    const { page } = await openPage(browser, { body: card('/p/1.jpg /p/2.jpg'), behaviors: ['cardPhotos'] });
    await swipe(page, -60, 0, 'mouse');
    expect(await src(page)).toBe('/p/2.jpg');
    await page.evaluate(() => document.getElementById('card')?.click());
    expect(await page.evaluate(() => location.hash)).toBe('');
    await page.close();
  });

  it('горизонтальный жест отдан фото: touch-action: pan-y, вертикальная прокрутка остаётся браузеру', async () => {
    const { page } = await openPage(browser, { body: card('/p/1.jpg /p/2.jpg'), behaviors: ['cardPhotos'] });
    expect(await page.$eval('#img', (el) => getComputedStyle(el).touchAction)).toBe('pan-y');
    await page.close();
  });

  it('прокрутка забрала жест: pointercancel отменяет свайп, фото не меняется', async () => {
    const { page } = await openPage(browser, { body: card('/p/1.jpg /p/2.jpg'), behaviors: ['cardPhotos'] });
    await swipeCancelled(page, -60, 0);
    expect(await src(page)).toBe('/p/1.jpg');
    await page.close();
  });
});

describe('sticky-header', () => {
  it('scroll-up: вниз ниже своей высоты — data-hidden, вверх — снят; режим читается на каждой прокрутке', async () => {
    const { page, errors } = await openPage(browser, { body: HEADER, behaviors: ['stickyHeader'] });
    const hidden = () => page.$eval('#header', (el) => el.hasAttribute('data-hidden'));
    const scroll = async (y: number) => {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForFunction((top) => Math.round(window.scrollY) === top, y);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    };
    await scroll(60);
    expect(await hidden()).toBe(false);
    await scroll(400);
    expect(await hidden()).toBe(true);
    await scroll(300);
    expect(await hidden()).toBe(false);
    await page.$eval('#header', (el) => el.setAttribute('data-mode', 'always'));
    await scroll(900);
    expect(await hidden()).toBe(false);
    await page.$eval('#header', (el) => el.setAttribute('data-mode', 'scroll-up'));
    await scroll(1400);
    expect(await hidden()).toBe(true);
    expect(errors).toEqual([]);
    await page.close();
  });
});

describe('video', () => {
  it('кнопка запускает ролик и скрывается; при pause и ended снова видна', async () => {
    const { page, errors } = await openPage(browser, { body: VIDEO, behaviors: ['video'], beforeCore: FAKE_MEDIA });
    await page.click('#play');
    expect(await page.$eval('#video', (el) => el instanceof HTMLMediaElement && el.paused)).toBe(false);
    expect(await page.$eval('#play', (el) => el.hasAttribute('hidden'))).toBe(true);
    await page.$eval('#video', (el) => {
      if (el instanceof HTMLMediaElement) el.pause();
    });
    expect(await page.$eval('#play', (el) => el.hasAttribute('hidden'))).toBe(false);
    await page.click('#play');
    await page.$eval('#video', (el) => el.dispatchEvent(new Event('ended')));
    expect(await page.$eval('#play', (el) => el.hasAttribute('hidden'))).toBe(false);
    expect(errors).toEqual([]);
    await page.close();
  });
});

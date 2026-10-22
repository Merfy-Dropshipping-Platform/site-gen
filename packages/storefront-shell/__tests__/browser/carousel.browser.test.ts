import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EASINGS } from '../../src/core/behaviors/catalog';
import { clickAndRead, curve, frames, openPage, type PageOptions } from './behaviors-support';

// Слайдер в Chromium (design.md блока 6, раздел 3; факты 5, 7, 17): Embla, Autoplay и Fade, части и доступность,
// смена Fade против CSS-перехода пяти тем, «уменьшить движение», save и restore для превью.
const COUNT = 5;
const slides = Array.from(
  { length: COUNT },
  (_, i) =>
    `<div data-part="slide" style="flex:0 0 100%;height:200px"><p data-part="copy" id="copy-${i + 1}">Слайд ${i + 1}</p></div>`,
).join('');
const dots = Array.from(
  { length: COUNT },
  (_, i) => `<button data-part="dot" id="dot-${i + 1}">${i + 1}</button>`,
).join('');
const thumbs = Array.from(
  { length: COUNT },
  (_, i) => `<button data-part="thumb" id="thumb-${i + 1}">${i + 1}</button>`,
).join('');

const carousel = (
  attributes: string,
): string => `<merfy-section data-section="shop:slideshow" data-section-id="hero" style="display:block">
  <div data-behavior="carousel" id="root" ${attributes}>
    <div data-part="viewport" style="overflow:hidden;width:600px"><div data-part="container" style="display:flex">${slides}</div></div>
    <button data-part="prev" id="prev">Назад</button><button data-part="next" id="next">Вперёд</button>
    ${dots}${thumbs}<span data-part="counter" id="counter"></span><button data-part="play" id="play">Пауза</button>
  </div>
</merfy-section>`;

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

const open = (attributes: string, extra: Partial<PageOptions> = {}) =>
  openPage(browser, { body: carousel(attributes), behaviors: ['carousel'], ...extra });
const counter = (page: Page) => page.textContent('#counter');
const waitCounter = (page: Page, value: string, timeout = 2000) =>
  page.waitForFunction((v) => document.getElementById('counter')?.textContent === v, value, { timeout });

// CSS cubic-bezier(x1, 0, x2, 1) по времени x от 0 до 1 — для сравнения со сменой Fade.
function bezierAt([x1, , x2]: readonly number[], x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let low = 0;
  let high = 1;
  for (let i = 0; i < 40; i += 1) {
    const s = (low + high) / 2;
    const at = 3 * (1 - s) ** 2 * s * (x1 ?? 0) + 3 * (1 - s) * s * s * (x2 ?? 1) + s ** 3;
    if (at < x) low = s;
    else high = s;
  }
  const s = (low + high) / 2;
  return 3 * (1 - s) * s * s + s ** 3;
}

describe('carousel', () => {
  it('доступность и части: region, «1 из 5», текущая точка, счётчик, prev и next', async () => {
    const { page, errors } = await open('data-loop="false"');
    const state = await page.evaluate(() => {
      const root = document.getElementById('root');
      const slide = document.querySelector('[data-part="slide"]');
      return {
        role: root?.getAttribute('role'),
        roledescription: root?.getAttribute('aria-roledescription'),
        slide: [
          slide?.getAttribute('role'),
          slide?.getAttribute('aria-roledescription'),
          slide?.getAttribute('aria-label'),
        ],
        dot: [
          document.getElementById('dot-1')?.getAttribute('aria-current'),
          document.getElementById('dot-1')?.hasAttribute('data-active'),
        ],
        other: document.getElementById('dot-2')?.hasAttribute('aria-current'),
        prev: document.querySelector('#prev:disabled') !== null,
      };
    });
    expect(state).toEqual({
      role: 'region',
      roledescription: 'carousel',
      slide: ['group', 'slide', '1 из 5'],
      dot: ['true', true],
      other: false,
      prev: true,
    });
    expect(await counter(page)).toBe('1');
    expect(errors).toEqual([]);
    await page.close();
  });

  it('«вперёд», точка и миниатюра переключают слайд; текст слайда — fade-up 500 мс material', async () => {
    const { page } = await open('');
    const [copy] = await clickAndRead(page, '#next', '#copy-2');
    expect(copy).toMatchObject({ duration: 500, first: { opacity: '0' }, last: { opacity: '1' } });
    expect(copy?.easing).toEqual(curve('material'));
    await waitCounter(page, '2');
    expect(await page.getAttribute('#dot-2', 'aria-current')).toBe('true');
    expect(await page.getAttribute('#dot-1', 'aria-current')).toBeNull();
    await page.click('#dot-4');
    await waitCounter(page, '4');
    await page.click('#thumb-5');
    await waitCounter(page, '5');
    expect(await page.getAttribute('#thumb-5', 'aria-current')).toBe('true');
    await page.close();
  });

  it('loop=false: на последнем слайде «вперёд» недоступна', async () => {
    const { page } = await open('data-loop="false"');
    await page.click('#dot-5');
    await waitCounter(page, '5');
    await page.waitForFunction(() => document.querySelector('#next:disabled') !== null);
    expect(await page.evaluate(() => document.querySelector('#prev:disabled') !== null)).toBe(false);
    await page.close();
  });

  it.each([
    ['700', 'decelerate', 700],
    ['500', 'decelerate', 500],
  ] as const)(
    'Fade, change=%s: смена — как CSS-переход %s за %i мс, расхождение не больше 0,08',
    async (change, easing, ms) => {
      const { page } = await open(`data-effect="fade" data-change="${change}" data-loop="false"`);
      await frames(page);
      const samples = await page.evaluate(
        () =>
          new Promise<[number, number][]>((resolve) => {
            const slide = document.querySelectorAll('[data-part="slide"]')[1];
            const rows: [number, number][] = [];
            let start: number | null = null;
            const step = (time: number): void => {
              if (start === null) {
                start = time;
                document.getElementById('next')?.click();
              }
              rows.push([time - start, slide ? Number(getComputedStyle(slide).opacity) : -1]);
              if (time - start < 1500) requestAnimationFrame(step);
              else resolve(rows);
            };
            requestAnimationFrame(step);
          }),
      );
      // Кадр старта у Embla и у CSS может разойтись на кадр-два: берём лучшее из сдвигов −17…+34 мс.
      const worst = Math.max(
        ...samples.map(([time, opacity]) =>
          Math.min(
            ...[-17, 0, 17, 34].map((shift) => Math.abs(opacity - bezierAt(EASINGS[easing], (time - shift) / ms))),
          ),
        ),
      );
      expect(samples.at(-1)?.[1]).toBe(1);
      expect(worst).toBeLessThanOrEqual(0.08);
      await page.close();
    },
  );

  it('автопрокрутка через data-autoplay секунд; нажатие на точку — таймер с нуля', async () => {
    const { page } = await open('data-autoplay="1"');
    await waitCounter(page, '2', 2500);
    await page.waitForTimeout(500);
    await page.click('#dot-4');
    await waitCounter(page, '4');
    await page.waitForTimeout(700);
    expect(await counter(page)).toBe('4');
    await waitCounter(page, '5', 1500);
    await page.close();
  });

  it('кнопка play ставит автопрокрутку на паузу и снимает её: aria-pressed, data-paused', async () => {
    const { page } = await open('data-autoplay="1"');
    await page.click('#play');
    expect(await page.getAttribute('#play', 'aria-pressed')).toBe('true');
    expect(await page.$eval('#root', (el) => el.hasAttribute('data-paused'))).toBe(true);
    await page.waitForTimeout(1600);
    expect(await counter(page)).toBe('1');
    await page.click('#play');
    expect(await page.getAttribute('#play', 'aria-pressed')).toBe('false');
    await waitCounter(page, '2', 2500);
    await page.close();
  });

  it('«уменьшить движение»: автопрокрутки нет, смена — сразу, текст без анимации', async () => {
    const { page } = await open('data-autoplay="1"', { reducedMotion: true });
    expect(await clickAndRead(page, '#next', '#copy-2')).toEqual([null]);
    await frames(page);
    expect(await page.$eval('[data-part="container"]', (el) => getComputedStyle(el).transform)).toBe(
      'matrix(1, 0, 0, 1, -600, 0)',
    );
    await page.waitForTimeout(1600);
    expect(await counter(page)).toBe('2');
    await page.close();
  });

  it('save и restore: номер слайда переживает замену секции; снятие — без ошибок', async () => {
    const { page, errors } = await open('');
    await page.click('#dot-3');
    await waitCounter(page, '3');
    await page.evaluate((markup) => {
      const state = window.__behaviorsApi?.save('hero');
      document.querySelector('merfy-section')?.remove();
      document.body.insertAdjacentHTML('afterbegin', markup);
      return new Promise<void>((resolve) =>
        setTimeout(() => {
          window.__behaviorsApi?.restore('hero', state);
          resolve();
        }, 50),
      );
    }, carousel(''));
    await waitCounter(page, '3');
    expect(errors).toEqual([]);
    await page.close();
  });
});

import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPage } from './behaviors-support';

// Карусель карточек (несколько слайдов в окне). Секция расширения грузит данные в браузере, поэтому при запуске
// поведения корень скрыт (hidden), а лишние слайды-заготовки скрыты поштучно: display:none даёт Embla нулевой
// прямоугольник, и расчёт лент ломается (стоп 04.11: пустота слева, стрелки на 8 px, «вперёд» отключена).
// Слайды — четверть окна, зазор — отступ справа, как в карточках витрины.
const COUNT = 12;
const SHOWN = 6;
const WIDTH = 1184;
const SLIDE = WIDTH / 4;

const cards = (hiddenSlides: boolean): string =>
  Array.from(
    { length: COUNT },
    (_, i) =>
      `<div data-part="slide" ${hiddenSlides ? 'hidden' : ''} style="flex:0 0 25%;padding-right:12px;box-sizing:border-box"><div style="height:80px">Карточка ${i + 1}</div></div>`,
  ).join('');

interface Layout {
  readonly attributes?: string;
  readonly rootHidden?: boolean;
  readonly hiddenSlides?: boolean;
}

const carousel = ({
  attributes = '',
  rootHidden = true,
  hiddenSlides = true,
}: Layout): string => `<merfy-section data-section="shop:cards" data-section-id="cards" style="display:block">
  <div data-behavior="carousel" id="root" ${attributes} ${rootHidden ? 'hidden' : ''}>
    <div data-part="viewport" style="overflow:hidden;width:${WIDTH}px"><div data-part="container" style="display:flex">${cards(hiddenSlides)}</div></div>
    <button data-part="prev" id="prev">Назад</button><button data-part="next" id="next">Вперёд</button>
  </div>
</merfy-section>`;

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

const open = (layout: Layout = {}) => openPage(browser, { body: carousel(layout), behaviors: ['carousel'] });

// Секция «загрузила данные»: корень показан, первые карточки показаны, остальные заготовки скрыты.
const reveal = (page: Page, shown = SHOWN): Promise<void> =>
  page.evaluate((count) => {
    document.getElementById('root')?.removeAttribute('hidden');
    document.querySelectorAll('[data-part="slide"]').forEach((slide, i) => {
      if (i < count) slide.removeAttribute('hidden');
    });
  }, shown);

// Левый край первого показанного слайда относительно окна; ждём, пока лента встанет (два одинаковых замера подряд).
async function firstSlideX(page: Page): Promise<number> {
  const read = () =>
    page.evaluate(() => {
      const viewport = document.querySelector('[data-part="viewport"]')?.getBoundingClientRect();
      const slide = document.querySelector('[data-part="slide"]:not([hidden])');
      return Math.round((slide?.getBoundingClientRect().x ?? 0) - (viewport?.x ?? 0));
    });
  let last = await read();
  for (let i = 0; i < 40; i += 1) {
    await page.waitForTimeout(100);
    const now = await read();
    if (now === last) return now;
    last = now;
  }
  return last;
}

const disabled = (page: Page, selector: string): Promise<boolean> =>
  page.evaluate((s) => document.querySelector(s)?.hasAttribute('disabled') === true, selector);

describe('carousel: карточки появляются после запуска поведения', () => {
  it('корень и слайды скрыты при запуске: лента стоит с первого слайда, без пустоты слева', async () => {
    const { page, errors } = await open({ attributes: 'data-loop="false"' });
    await reveal(page);
    expect(await firstSlideX(page)).toBe(0);
    expect(await disabled(page, '#next')).toBe(false);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('только корень скрыт при запуске, слайды обычные: лента стоит с первого слайда', async () => {
    const { page } = await open({ attributes: 'data-loop="false"', hiddenSlides: false });
    await reveal(page, COUNT);
    expect(await firstSlideX(page)).toBe(0);
    expect(await disabled(page, '#next')).toBe(false);
    await page.close();
  });

  it('корень виден, слайды показаны после запуска: лента стоит с первого слайда', async () => {
    const { page } = await open({ attributes: 'data-loop="false"', rootHidden: false });
    await reveal(page);
    expect(await firstSlideX(page)).toBe(0);
    expect(await disabled(page, '#next')).toBe(false);
    await page.close();
  });

  it('по умолчанию (loop, без align) первый слайд — у левого края окна', async () => {
    const { page } = await open();
    await reveal(page);
    expect(await firstSlideX(page)).toBe(0);
    await page.close();
  });

  it('data-align="center": первый слайд по центру окна', async () => {
    const { page } = await open({ attributes: 'data-align="center"' });
    await reveal(page);
    expect(await firstSlideX(page)).toBe(Math.round((WIDTH - SLIDE) / 2));
    await page.close();
  });

  it('«вперёд» и «назад» двигают ленту ровно на слайд', async () => {
    const { page } = await open();
    await reveal(page);
    expect(await firstSlideX(page)).toBe(0);
    const offsets: number[] = [];
    await page.click('#next');
    offsets.push(await firstSlideX(page));
    await page.click('#next');
    offsets.push(await firstSlideX(page));
    await page.click('#prev');
    offsets.push(await firstSlideX(page));
    expect(offsets).toEqual([-SLIDE, -2 * SLIDE, -SLIDE]);
    await page.close();
  });

  it('data-loop="false": «назад» отключена в начале, «вперёд» доступна и после resize окна', async () => {
    const { page } = await open({ attributes: 'data-loop="false"' });
    await reveal(page);
    await firstSlideX(page);
    expect(await disabled(page, '#prev')).toBe(true);
    expect(await disabled(page, '#next')).toBe(false);
    await page.setViewportSize({ width: 1500, height: 700 });
    await firstSlideX(page);
    expect(await disabled(page, '#next')).toBe(false);
    await page.close();
  });

  it('карточки, показанные позже, становятся листаемыми: было 2 слайда — стало 6', async () => {
    const { page } = await open({ attributes: 'data-loop="false"', rootHidden: false });
    await reveal(page, 2);
    await firstSlideX(page);
    expect(await disabled(page, '#next')).toBe(true);
    await reveal(page, SHOWN);
    await firstSlideX(page);
    expect(await disabled(page, '#next')).toBe(false);
    await page.close();
  });
});

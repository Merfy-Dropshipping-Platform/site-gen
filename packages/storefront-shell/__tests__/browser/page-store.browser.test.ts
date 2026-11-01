import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API_URL } from '../core-support';
import { openPage, type SectionModule } from './behaviors-support';

// Модуль page в Chromium: настоящая прокрутка, настоящий курсор и касания, смещение часов из ответа шлюза. Код секции —
// как у мерчанта: ctx.page.$scroll, $leaving, $now через ctx.watch; результат он кладёт в window для проверки.
const SECTION: SectionModule = {
  name: 'shop:watcher',
  uses: ['page'],
  code: `export default {
    mount(el, ctx) {
      window.__scrolls = [];
      window.__leavings = [];
      window.__events = 0;
      window.__nows = [];
      ctx.watch(ctx.page.$scroll, (value) => window.__scrolls.push(value));
      ctx.watch(ctx.page.$leaving, (value) => window.__leavings.push(value));
      ctx.watch(ctx.page.$now, (value) => window.__nows.push(value));
      ctx.listen('merfy:page:leaving', () => { window.__events += 1; });
      window.__path = ctx.page.path;
    },
  };`,
};

const BODY = `<merfy-section data-section="shop:watcher" data-section-id="w1" style="display:block"></merfy-section>
<div style="height:3000px"></div>`;
const TIME_URL = `${API_URL}/store/time`;
const HOUR = 3_600_000;

declare global {
  interface Window {
    __scrolls?: number[];
    __leavings?: boolean[];
    __events?: number;
    __nows?: (number | null)[];
    __path?: string;
  }
}

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

const scrolls = (page: Page): Promise<number[]> => page.evaluate(() => window.__scrolls ?? []);
const scrollTo = (page: Page, top: number): Promise<void> =>
  page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), top);

describe('$scroll', () => {
  it('доля прокрутки страницы: 0, 50, 100', async () => {
    const { page, errors } = await openPage(browser, { body: BODY, core: ['page'], sections: [SECTION] });
    // Страница 3000 px, окно 800 px: до низа 2200 px.
    await scrollTo(page, 1100);
    await page.waitForFunction(() => window.__scrolls?.includes(50));
    await scrollTo(page, 2200);
    await page.waitForFunction(() => window.__scrolls?.includes(100));
    await scrollTo(page, 0);
    await page.waitForFunction(() => window.__scrolls?.at(-1) === 0);
    expect(await scrolls(page)).toEqual([0, 50, 100, 0]);
    expect(await page.evaluate(() => window.__path)).toBe('/'); // ctx.page.path на месте рядом со сторами
    expect(errors).toEqual([]);
  });
});

describe('$leaving', () => {
  it('курсор вышел за верхний край окна: true и событие; вернулся — false', async () => {
    const { page, errors } = await openPage(browser, { body: BODY, core: ['page'], sections: [SECTION] });
    await page.mouse.move(600, 300);
    await page.mouse.move(600, 0);
    await page.mouse.move(600, -20);
    await page.waitForFunction(() => window.__leavings?.includes(true));
    expect(await page.evaluate(() => window.__events)).toBe(1);
    await page.mouse.move(600, 300);
    await page.waitForFunction(() => window.__leavings?.at(-1) === false);
    expect(await page.evaluate(() => window.__leavings)).toEqual([false, true, false]);
    expect(errors).toEqual([]);
  });

  it('курсор ушёл вбок или вниз — не уход', async () => {
    const { page } = await openPage(browser, { body: BODY, core: ['page'], sections: [SECTION] });
    await page.mouse.move(600, 300);
    await page.mouse.move(1500, 300);
    await page.mouse.move(600, 300);
    await page.mouse.move(600, 900);
    expect(await page.evaluate(() => [window.__events, window.__leavings])).toEqual([0, [false]]);
  });

  it('телефон: резкая прокрутка вверх к верху страницы; медленная — нет', async () => {
    const { page } = await openPage(browser, {
      body: BODY,
      core: ['page'],
      sections: [SECTION],
      touch: true,
      viewport: { width: 390, height: 800 },
    });
    await scrollTo(page, 2000);
    await page.waitForFunction(() => window.scrollY === 2000);
    // Медленно: 100 px за 130 мс (0,8 px/мс) — ниже порога скорости, даже у самого верха.
    for (let y = 1900; y >= 0; y -= 100) {
      await scrollTo(page, y);
      await page.waitForTimeout(130);
    }
    expect(await page.evaluate(() => window.__events)).toBe(0);
    await scrollTo(page, 2000);
    await page.waitForFunction(() => window.scrollY === 2000);
    await scrollTo(page, 0); // 2000 px сразу, пока прошлое положение ещё в окне TOUCH_WINDOW_MS
    await page.waitForFunction(() => window.__leavings?.includes(true));
    expect(await page.evaluate(() => window.__events)).toBe(1);
  });
});

describe('$now', () => {
  const answer =
    (offset: number) =>
    async (page: Page): Promise<void> => {
      await page.route(TIME_URL, (route) =>
        route.fulfill({
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({ now: Date.now() + offset }),
        }),
      );
    };

  it('время сервера: часы устройства отстают на час — $now впереди на час, до ответа он null', async () => {
    const { page, errors } = await openPage(browser, {
      body: BODY,
      core: ['page'],
      sections: [SECTION],
      prepare: answer(HOUR),
    });
    await page.waitForFunction(() => window.__nows?.some((value) => value !== null));
    const [first, last, device] = await page.evaluate(() => {
      const nows = window.__nows ?? [];
      return [nows[0], nows.at(-1), Date.now()] as const;
    });
    expect(first).toBeNull();
    expect(Math.abs((last ?? 0) - device - HOUR)).toBeLessThan(2000);
    expect(errors).toEqual([]);
  });

  it('обновляется раз в секунду', async () => {
    const { page } = await openPage(browser, { body: BODY, core: ['page'], sections: [SECTION], prepare: answer(0) });
    await page.waitForFunction(() => (window.__nows?.filter((value) => value !== null).length ?? 0) >= 3, null, {
      timeout: 5000,
    });
    const times = await page.evaluate(() => (window.__nows ?? []).filter((value): value is number => value !== null));
    const step = (times[2] ?? 0) - (times[1] ?? 0);
    expect(step).toBeGreaterThan(900);
    expect(step).toBeLessThan(1200);
  });

  it('превью: часы устройства, запроса к шлюзу нет', async () => {
    let asked = 0;
    const { page } = await openPage(browser, {
      body: BODY,
      core: ['page'],
      sections: [SECTION],
      mode: 'preview',
      prepare: async (target) => {
        await target.route(TIME_URL, (route) => {
          asked += 1;
          return route.abort();
        });
      },
    });
    await page.waitForFunction(() => window.__nows?.[0] !== undefined);
    const [now, device] = await page.evaluate(() => [window.__nows?.[0] ?? null, Date.now()] as const);
    expect(Math.abs((now ?? 0) - device)).toBeLessThan(2000);
    expect(asked).toBe(0);
  });
});

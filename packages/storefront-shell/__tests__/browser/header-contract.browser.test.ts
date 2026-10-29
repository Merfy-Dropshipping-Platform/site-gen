import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPage } from './behaviors-support';

// Разметка «Шапки» целиком в Chromium (блок 7, часть 7б, Р7б-4, Р7б-5): закрепление на самой <merfy-section>, меню по
// нажатию, боковая панель и панель поиска в одной секции. Разметка — договор для шаблона «Шапки» (plan-7b.md, 7б-3).
const HEADER = `<merfy-section data-section="shop:header" data-section-id="header" data-behavior="sticky-header" data-mode="scroll-up"
  style="display:block;position:sticky;top:0;z-index:50;height:80px;background:#fff">
  <div data-behavior="dialog" data-side="left" data-transition="drawer">
    <button data-part="open" id="burger" aria-label="Меню">Меню</button>
    <dialog data-part="content" id="side" style="margin:0;width:360px;height:100vh;max-height:none">
      <button data-part="close" id="side-close" aria-label="Закрыть меню">Закрыть</button>
      <a id="side-link" href="#catalog">Каталог</a>
    </dialog>
  </div>
  <nav data-behavior="nav-menu" aria-label="Основное меню">
    <ul data-part="list">
      <li data-part="item"><button data-part="trigger" id="t-catalog">Каталог</button>
        <div data-part="content" id="c-catalog"><ul data-part="list">
          <li data-part="item"><button data-part="trigger" id="t-scarves">Шарфы</button>
            <div data-part="content" id="c-scarves"><a data-part="link" id="cashmere" href="#cashmere">Кашемир</a><a data-part="link" id="wool" href="#wool">Шерсть</a></div></li>
        </ul></div></li>
      <li data-part="item"><a data-part="link" id="contacts" href="#contacts">Контакты</a></li>
    </ul>
  </nav>
  <div data-behavior="dialog" data-modal="false" data-lock-scroll="false" data-transition="fade">
    <button data-part="open" id="search-open" aria-label="Поиск">Поиск</button>
    <dialog data-part="content" id="search"><form role="search"><input type="search" name="q" aria-label="Поиск" autofocus></form></dialog>
  </div>
</merfy-section><div style="height:4000px" id="page">Страница</div>`;

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

const open = () => openPage(browser, { body: HEADER, behaviors: ['dialog', 'navMenu', 'stickyHeader'] });
const isOpen = (page: Page, selector: string) => page.$eval(selector, (el) => el.hasAttribute('open'));
const shown = (page: Page, ids: readonly string[]) =>
  page.evaluate((list) => list.map((id) => !document.getElementById(id)?.hidden), ids);
const focusedId = (page: Page) => page.evaluate(() => document.activeElement?.id);

async function scrollTo(page: Page, top: number): Promise<void> {
  await page.evaluate((y) => window.scrollTo(0, y), top);
  await page.waitForFunction((y) => Math.round(window.scrollY) === y, top);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

describe('разметка «Шапки» в Chromium', () => {
  it('меню: три уровня по нажатию, открыта одна ветка; нажатие вне меню и Escape закрывают, фокус — на пункте', async () => {
    const { page, errors } = await open();
    await page.click('#t-catalog');
    await page.click('#t-scarves');
    expect(await shown(page, ['c-catalog', 'c-scarves'])).toEqual([true, true]);
    expect(await page.getAttribute('#t-scarves', 'aria-expanded')).toBe('true');
    await page.mouse.click(640, 600);
    expect(await shown(page, ['c-catalog', 'c-scarves'])).toEqual([false, false]);
    await page.click('#t-catalog');
    await page.keyboard.press('Escape');
    expect(await shown(page, ['c-catalog'])).toEqual([false]);
    expect(await focusedId(page)).toBe('t-catalog');
    expect(errors).toEqual([]);
    await page.close();
  });

  it('закрепление на самой секции работает рядом с меню и окнами: вниз — data-hidden, вверх — снят', async () => {
    const { page, errors } = await open();
    await scrollTo(page, 400);
    expect(await page.$eval('merfy-section', (el) => el.hasAttribute('data-hidden'))).toBe(true);
    await scrollTo(page, 300);
    expect(await page.$eval('merfy-section', (el) => el.hasAttribute('data-hidden'))).toBe(false);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('панель поиска: поле в фокусе при открытии, прокрутка страницы свободна (data-lock-scroll="false", как на проде), Escape возвращает фокус на значок', async () => {
    const { page } = await open();
    await page.click('#search-open');
    expect(
      await page.evaluate(() =>
        document.activeElement instanceof HTMLInputElement ? document.activeElement.name : '',
      ),
    ).toBe('q');
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('search')?.hasAttribute('open'));
    expect(await focusedId(page)).toBe('search-open');
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');
    await page.close();
  });

  it('боковая панель, открытая с клавиатуры, закрывает панель поиска; Escape закрывает панель, фокус — на бургере', async () => {
    const { page, errors } = await open();
    await page.click('#search-open');
    expect(await isOpen(page, '#search')).toBe(true);
    await page.focus('#burger');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.getElementById('search')?.hasAttribute('open'));
    expect(await isOpen(page, '#side')).toBe(true);
    expect(await page.getAttribute('#burger', 'aria-expanded')).toBe('true');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('side')?.hasAttribute('open'));
    expect(await focusedId(page)).toBe('burger');
    expect(await page.getAttribute('#burger', 'aria-expanded')).toBe('false');
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');
    expect(errors).toEqual([]);
    await page.close();
  });
});

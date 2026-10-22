import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPage } from './behaviors-support';

// Вкладки и меню шапки в Chromium (design.md блока 6, раздел 6; блок 7, п. 16): шаблоны W3C APG Tabs и Disclosure
// Navigation Menu, свой код без библиотеки.
const tabs = (
  attributes: string,
): string => `<merfy-section data-section="shop:product" data-section-id="p1" style="display:block">
  <div data-behavior="tabs" id="tabs" ${attributes}>
    <div data-part="list">
      <button data-part="trigger" data-value="desc" id="t-desc">Описание</button>
      <button data-part="trigger" data-value="care" id="t-care">Уход</button>
      <button data-part="trigger" data-value="delivery" id="t-delivery">Доставка</button>
    </div>
    <div data-part="content" data-value="desc" id="p-desc">Шёлк</div>
    <div data-part="content" data-value="care" id="p-care">Ручная стирка</div>
    <div data-part="content" data-value="delivery">Курьером</div>
  </div>
</merfy-section>`;

const menu = (
  attributes: string,
): string => `<merfy-section data-section="shop:header" data-section-id="header" style="display:block">
  <nav data-behavior="nav-menu" ${attributes}>
    <ul data-part="list">
      <li data-part="item" id="i-women"><button data-part="trigger" id="t-women">Женщинам</button>
        <div data-part="content" id="c-women"><ul data-part="list">
          <li data-part="item"><button data-part="trigger" id="t-scarves">Шарфы</button>
            <div data-part="content" id="c-scarves"><a data-part="link" href="#silk" id="silk">Шёлк</a> <a data-part="link" href="#wool" id="wool">Шерсть</a></div></li>
          <li data-part="item"><a data-part="link" href="#hats" id="hats">Шапки</a></li>
        </ul></div></li>
      <li data-part="item"><button data-part="trigger" id="t-men">Мужчинам</button>
        <div data-part="content" id="c-men"><a data-part="link" href="#men" id="men">Всё</a></div></li>
      <li data-part="item"><a data-part="link" href="#sale" id="sale">Скидки</a></li>
    </ul>
  </nav>
</merfy-section><div style="height:800px" id="page">Страница</div>`;

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

const focused = (page: Page) => page.evaluate(() => document.activeElement?.id);
const shown = (page: Page, ids: readonly string[]) =>
  page.evaluate((list) => list.map((id) => !document.getElementById(id)?.hidden), ids);

describe('tabs', () => {
  it('роли и связи: tablist, tab, tabpanel; открыта первая, остальные панели hidden; tabindex', async () => {
    const { page, errors } = await openPage(browser, { body: tabs(''), behaviors: ['tabs'] });
    const state = await page.evaluate(() => {
      const desc = document.getElementById('t-desc');
      const panel = document.getElementById(desc?.getAttribute('aria-controls') ?? '');
      return {
        list: document.querySelector('[data-part="list"]')?.getAttribute('role'),
        tab: [desc?.getAttribute('role'), desc?.getAttribute('aria-selected'), desc?.getAttribute('tabindex')],
        other: [
          document.getElementById('t-care')?.getAttribute('aria-selected'),
          document.getElementById('t-care')?.getAttribute('tabindex'),
        ],
        panel: [panel?.getAttribute('role'), panel?.getAttribute('aria-labelledby'), panel?.id],
        hidden: [...document.querySelectorAll('[data-part="content"]')].map((el) => el.hasAttribute('hidden')),
      };
    });
    expect(state).toEqual({
      list: 'tablist',
      tab: ['tab', 'true', '0'],
      other: ['false', '-1'],
      panel: ['tabpanel', 't-desc', 'p-desc'],
      hidden: [false, true, true],
    });
    expect(errors).toEqual([]);
    await page.close();
  });

  it('data-value открывает свою вкладку; нажатие мышью переключает', async () => {
    const { page } = await openPage(browser, { body: tabs('data-value="care"'), behaviors: ['tabs'] });
    expect(await page.getAttribute('#t-care', 'aria-selected')).toBe('true');
    await page.click('#t-delivery');
    expect(await page.getAttribute('#t-delivery', 'aria-selected')).toBe('true');
    expect(await shown(page, ['p-desc', 'p-care'])).toEqual([false, false]);
    await page.close();
  });

  it('клавиатура: → и ← по кругу, Home, End — фокус и выбор вместе', async () => {
    const { page } = await openPage(browser, { body: tabs(''), behaviors: ['tabs'] });
    await page.focus('#t-desc');
    await page.keyboard.press('ArrowRight');
    expect([await focused(page), await page.getAttribute('#t-care', 'aria-selected')]).toEqual(['t-care', 'true']);
    await page.keyboard.press('End');
    expect(await focused(page)).toBe('t-delivery');
    await page.keyboard.press('ArrowRight');
    expect(await focused(page)).toBe('t-desc');
    await page.keyboard.press('ArrowLeft');
    expect(await focused(page)).toBe('t-delivery');
    await page.keyboard.press('Home');
    expect([await focused(page), await page.getAttribute('#t-desc', 'aria-selected')]).toEqual(['t-desc', 'true']);
    await page.close();
  });

  it('вертикальные: aria-orientation, ↓ и ↑; → не переключает', async () => {
    const { page } = await openPage(browser, { body: tabs('data-orientation="vertical"'), behaviors: ['tabs'] });
    expect(await page.getAttribute('[data-part="list"]', 'aria-orientation')).toBe('vertical');
    await page.focus('#t-desc');
    await page.keyboard.press('ArrowRight');
    expect(await focused(page)).toBe('t-desc');
    await page.keyboard.press('ArrowDown');
    expect(await focused(page)).toBe('t-care');
    await page.keyboard.press('ArrowUp');
    expect(await focused(page)).toBe('t-desc');
    await page.close();
  });

  it('save и restore: открытая вкладка переживает замену секции', async () => {
    const { page } = await openPage(browser, { body: tabs(''), behaviors: ['tabs'] });
    await page.click('#t-delivery');
    await page.evaluate((markup) => {
      const state = window.__behaviorsApi?.save('p1');
      document.querySelector('merfy-section')?.remove();
      document.body.insertAdjacentHTML('afterbegin', markup);
      window.__behaviorsApi?.restore('p1', state);
    }, tabs(''));
    expect(await page.getAttribute('#t-delivery', 'aria-selected')).toBe('true');
    await page.close();
  });
});

describe('nav-menu', () => {
  it('нажатие открывает подменю; открыта одна ветка; вложенный пункт оставляет родителя открытым', async () => {
    const { page, errors } = await openPage(browser, { body: menu(''), behaviors: ['navMenu'] });
    expect(await shown(page, ['c-women', 'c-scarves', 'c-men'])).toEqual([false, false, false]);
    expect(await page.getAttribute('#t-women', 'aria-expanded')).toBe('false');
    await page.click('#t-women');
    expect(await page.getAttribute('#t-women', 'aria-expanded')).toBe('true');
    expect(await page.$eval('#i-women', (el) => el.hasAttribute('data-open'))).toBe(true);
    await page.click('#t-scarves');
    expect(await shown(page, ['c-women', 'c-scarves', 'c-men'])).toEqual([true, true, false]);
    await page.click('#t-men');
    expect(await shown(page, ['c-women', 'c-scarves', 'c-men'])).toEqual([false, false, true]);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('нажатие вне меню закрывает всё; Escape — тоже, фокус — на кнопку верхнего уровня', async () => {
    const { page } = await openPage(browser, { body: menu(''), behaviors: ['navMenu'] });
    await page.click('#t-women');
    await page.mouse.click(640, 600);
    expect(await shown(page, ['c-women'])).toEqual([false]);
    await page.click('#t-women');
    await page.click('#t-scarves');
    await page.focus('#silk');
    await page.keyboard.press('Escape');
    expect(await shown(page, ['c-women', 'c-scarves'])).toEqual([false, false]);
    expect(await focused(page)).toBe('t-women');
    await page.close();
  });

  it('клавиатура: ↓ на кнопке открывает и ведёт к первому пункту; ↑ и ↓ — по пунктам; ← и → — по верхнему уровню', async () => {
    const { page } = await openPage(browser, { body: menu(''), behaviors: ['navMenu'] });
    await page.focus('#t-women');
    await page.keyboard.press('ArrowDown');
    expect([await focused(page), ...(await shown(page, ['c-women']))]).toEqual(['t-scarves', true]);
    await page.keyboard.press('ArrowDown');
    expect(await focused(page)).toBe('hats');
    await page.keyboard.press('ArrowUp');
    expect(await focused(page)).toBe('t-scarves');
    await page.focus('#t-women');
    await page.keyboard.press('ArrowRight');
    expect(await focused(page)).toBe('t-men');
    await page.keyboard.press('ArrowRight');
    expect(await focused(page)).toBe('sale');
    await page.keyboard.press('ArrowLeft');
    expect(await focused(page)).toBe('t-men');
    await page.close();
  });

  it('open-on="hover": открытие через 200 мс, закрытие через 300 мс после ухода', async () => {
    const { page } = await openPage(browser, { body: menu('data-open-on="hover"'), behaviors: ['navMenu'] });
    const opened = Date.now();
    await page.hover('#t-women');
    expect(await shown(page, ['c-women'])).toEqual([false]);
    await page.waitForFunction(() => !document.getElementById('c-women')?.hidden, undefined, { timeout: 1000 });
    expect(Date.now() - opened).toBeGreaterThanOrEqual(190);
    const left = Date.now();
    await page.mouse.move(640, 700);
    expect(await shown(page, ['c-women'])).toEqual([true]);
    await page.waitForFunction(() => document.getElementById('c-women')?.hidden === true, undefined, { timeout: 1000 });
    expect(Date.now() - left).toBeGreaterThanOrEqual(290);
    await page.close();
  });
});

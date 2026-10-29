import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { animations, clickAndRead, curve, openPage, type PageOptions } from './behaviors-support';

// Аккордеон и окно в Chromium (design.md блока 6, разделы 4 и 5; дополнения блока 7, п. 15): значения satin и четырёх
// тем, Escape, фон, запрет прокрутки, немодальные окна под шапкой.
const FAQ = `<merfy-section data-section="shop:faq" data-section-id="faq" style="display:block">
  <div data-behavior="accordion">
    <details name="faq" id="q1"><summary id="s1">Доставка</summary><div data-part="content"><p style="margin:0;height:120px">Курьером за 2 дня</p></div></details>
    <details name="faq" id="q2"><summary id="s2">Оплата</summary><div data-part="content"><p style="margin:0;height:80px">Картой</p></div></details>
    <details id="q3"><summary id="s3">Возврат</summary><div data-part="content"><p style="margin:0;height:40px">14 дней</p></div></details>
  </div>
</merfy-section>`;

const drawer = (
  attributes: string,
): string => `<merfy-section data-section="shop:cart" data-section-id="cart" style="display:block">
  <div data-behavior="dialog" ${attributes}>
    <button data-part="open" id="open-drawer">Корзина</button>
    <dialog data-part="content" id="drawer" style="margin:0 0 0 auto;width:400px;height:100vh;max-height:none">
      <button data-part="close" id="close-drawer">Закрыть</button><a href="#done" id="link">В каталог</a>
    </dialog>
  </div>
</merfy-section><div style="height:3000px"></div>`;

const HEADER = `<merfy-section data-section="shop:header" data-section-id="header" style="display:block;position:sticky;top:0;height:80px;background:#fff">
  <div data-behavior="dialog" data-modal="false" data-transition="drop">
    <button data-part="open" id="open-menu">Меню</button>
    <dialog data-part="content" id="menu"><a href="#catalog" id="menu-link">Каталог</a></dialog>
  </div>
  <div data-behavior="dialog" data-modal="false">
    <button data-part="open" id="open-search">Поиск</button>
    <dialog data-part="content" id="search"><input aria-label="Поиск"></dialog>
  </div>
</merfy-section><div style="height:3000px" id="page">Страница</div>`;

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

const open = (body: string, extra: Partial<PageOptions> = {}) =>
  openPage(browser, { body, behaviors: ['accordion', 'dialog'], ...extra });
const isOpen = (page: Page, selector: string) => page.$eval(selector, (el) => el.hasAttribute('open'));
const settle = (page: Page) =>
  page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));

describe('accordion', () => {
  it('раскрытие: open сразу, высота 0 → высота содержимого и прозрачность 0 → 1 за 350 мс power2.out', async () => {
    const { page, errors } = await open(FAQ);
    const [content] = await clickAndRead(page, '#s1', '#q1 [data-part="content"]');
    expect(await isOpen(page, '#q1')).toBe(true);
    expect(content).toMatchObject({
      duration: 350,
      first: { height: '0px', opacity: '0' },
      last: { height: '120px', opacity: '1' },
    });
    expect(content?.easing).toEqual(curve('power2.out'));
    expect(errors).toEqual([]);
    await page.close();
  });

  it('закрытие: 300 мс power2.inOut, open снимается после анимации', async () => {
    const { page } = await open(FAQ);
    await page.click('#s1');
    await settle(page);
    const [content] = await clickAndRead(page, '#s1', '#q1 [data-part="content"]');
    expect(content).toMatchObject({
      duration: 300,
      first: { height: '120px', opacity: '1' },
      last: { height: '0px', opacity: '0' },
    });
    expect(content?.easing).toEqual(curve('power2.inOut'));
    expect(await isOpen(page, '#q1')).toBe(true);
    await page.waitForFunction(() => !document.getElementById('q1')?.hasAttribute('open'));
    await page.close();
  });

  it('общий name — открыт один: соседний закрывается с анимацией; без name — сколько угодно', async () => {
    const { page } = await open(FAQ);
    await page.click('#s1');
    await settle(page);
    await page.click('#s3');
    const [first] = await clickAndRead(page, '#s2', '#q1 [data-part="content"]');
    expect(first).toMatchObject({ duration: 300, last: { height: '0px' } });
    await page.waitForFunction(() => !document.getElementById('q1')?.hasAttribute('open'));
    expect([await isOpen(page, '#q2'), await isOpen(page, '#q3')]).toEqual([true, true]);
    await page.close();
  });

  it('Enter на summary раскрывает так же', async () => {
    const { page } = await open(FAQ);
    await page.focus('#s1');
    await page.keyboard.press('Enter');
    expect(await isOpen(page, '#q1')).toBe(true);
    expect((await animations(page, '#q1 [data-part="content"]'))[0]?.duration).toBe(350);
    await page.close();
  });

  it('«уменьшить движение» — сразу, без анимаций', async () => {
    const { page } = await open(FAQ, { reducedMotion: true });
    expect(await clickAndRead(page, '#s1', '#q1 [data-part="content"]')).toEqual([null]);
    expect(await isOpen(page, '#q1')).toBe(true);
    expect(await clickAndRead(page, '#s1', '#q1 [data-part="content"]')).toEqual([null]);
    expect(await isOpen(page, '#q1')).toBe(false);
    await page.close();
  });
});

describe('dialog', () => {
  it('drawer: showModal, aria-expanded, панель справа за 300 мс decelerate, фон за 300 мс; прокрутка запрещена', async () => {
    const { page, errors } = await open(drawer('data-transition="drawer"'));
    expect(await page.getAttribute('#open-drawer', 'aria-expanded')).toBe('false');
    const [panel] = await clickAndRead(page, '#open-drawer', '#drawer');
    const [backdrop] = await animations(page, '#drawer', '::backdrop');
    expect(await page.$eval('#drawer', (el) => el.matches(':modal'))).toBe(true);
    expect(await page.getAttribute('#open-drawer', 'aria-expanded')).toBe('true');
    expect(panel).toMatchObject({
      duration: 300,
      first: { transform: 'translateX(100%)' },
      last: { transform: 'none' },
    });
    expect(panel?.easing).toEqual(curve('decelerate'));
    expect(backdrop).toMatchObject({ duration: 300, first: { opacity: '0' }, last: { opacity: '1' } });
    expect(backdrop?.easing).toEqual(curve('material'));
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden');
    expect(errors).toEqual([]);
    await page.close();
  });

  it('секцию с открытым окном убрали из страницы (замена списка «Каталога»): запрет прокрутки снят', async () => {
    const { page, errors } = await open(drawer('data-transition="drawer"'));
    await page.click('#open-drawer');
    await settle(page);
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden');
    await page.evaluate(() => document.querySelector('merfy-section')?.remove());
    await page.waitForFunction(() => document.documentElement.style.overflow === '');
    expect(errors).toEqual([]);
    await page.close();
  });

  it('Escape: сначала анимация закрытия, потом close(); фокус — на кнопке; прокрутка вернулась', async () => {
    const { page } = await open(drawer('data-transition="drawer"'));
    await page.click('#open-drawer');
    await settle(page);
    await page.keyboard.press('Escape');
    expect(await isOpen(page, '#drawer')).toBe(true);
    expect((await animations(page, '#drawer'))[0]).toMatchObject({
      first: { transform: 'none' },
      last: { transform: 'translateX(100%)' },
    });
    await page.waitForFunction(() => !document.getElementById('drawer')?.hasAttribute('open'));
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('open-drawer');
    expect(await page.getAttribute('#open-drawer', 'aria-expanded')).toBe('false');
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');
    await page.close();
  });

  it('нажатие на фон закрывает, внутри панели — нет; кнопка close закрывает', async () => {
    const { page } = await open(drawer('data-transition="drawer"'));
    await page.click('#open-drawer');
    await settle(page);
    await page.mouse.click(1100, 400);
    await settle(page);
    expect(await isOpen(page, '#drawer')).toBe(true);
    await page.mouse.click(100, 400);
    await page.waitForFunction(() => !document.getElementById('drawer')?.hasAttribute('open'));
    await page.click('#open-drawer');
    await settle(page);
    await page.click('#close-drawer');
    await page.waitForFunction(() => !document.getElementById('drawer')?.hasAttribute('open'));
    await page.close();
  });

  it('ссылка внутри закрывает окно сразу, до перехода', async () => {
    const { page } = await open(drawer('data-transition="drawer"'));
    await page.click('#open-drawer');
    const state = await page.evaluate(() => {
      document.getElementById('link')?.click();
      return {
        open: document.getElementById('drawer')?.hasAttribute('open'),
        overflow: document.documentElement.style.overflow,
      };
    });
    expect(state).toEqual({ open: false, overflow: '' });
    expect(await page.evaluate(() => location.hash)).toBe('#done');
    await page.close();
  });

  it('drawer-back слева: открытие 500 мс back.out, фон power2.out; закрытие 400 мс power3.in, фон power2.in', async () => {
    const { page } = await open(drawer('data-transition="drawer-back" data-side="left"'));
    const [panel] = await clickAndRead(page, '#open-drawer', '#drawer');
    const [backdrop] = await animations(page, '#drawer', '::backdrop');
    expect(panel).toMatchObject({ duration: 500, first: { transform: 'translateX(-100%)' } });
    expect(panel?.easing).toEqual(curve('back.out'));
    expect(backdrop?.easing).toEqual(curve('power2.out'));
    await settle(page);
    const [closing] = await clickAndRead(page, '#close-drawer', '#drawer');
    const [fading] = await animations(page, '#drawer', '::backdrop');
    expect(closing).toMatchObject({ duration: 400, last: { transform: 'translateX(-100%)' } });
    expect(closing?.easing).toEqual(curve('power3.in'));
    expect(fading).toMatchObject({ duration: 300, last: { opacity: '0' } });
    expect(fading?.easing).toEqual(curve('power2.in'));
    await page.close();
  });

  it('fade: прозрачность за 150 мс ease-out', async () => {
    const { page } = await open(drawer('data-transition="fade"'));
    const [panel] = await clickAndRead(page, '#open-drawer', '#drawer');
    expect(panel).toMatchObject({ duration: 150, first: { opacity: '0' }, last: { opacity: '1' } });
    expect(panel?.easing).toEqual(curve('ease-out'));
    await page.close();
  });

  it('немодальное меню: show(), верх — по низу шапки, drop за 300 мс; прокрутка страницы свободна; повторное нажатие закрывает', async () => {
    const { page } = await open(HEADER);
    const [menu] = await clickAndRead(page, '#open-menu', '#menu');
    expect(await page.$eval('#menu', (el) => el.hasAttribute('open') && !el.matches(':modal'))).toBe(true);
    expect(menu?.duration).toBe(300);
    expect(menu?.first.clipPath).toBeDefined();
    expect(menu?.easing).toEqual(curve('material'));
    expect(await page.$eval('#menu', (el) => Math.round(el.getBoundingClientRect().top))).toBe(80);
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');
    await settle(page);
    await page.click('#open-menu');
    await page.waitForFunction(() => !document.getElementById('menu')?.hasAttribute('open'));
    expect(await page.getAttribute('#open-menu', 'aria-expanded')).toBe('false');
    await page.close();
  });

  it('немодальные окна секции — по одному; Escape и нажатие вне окна закрывают', async () => {
    const { page } = await open(HEADER);
    await page.click('#open-menu');
    await page.click('#open-search');
    await page.waitForFunction(() => !document.getElementById('menu')?.hasAttribute('open'));
    expect(await isOpen(page, '#search')).toBe(true);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('search')?.hasAttribute('open'));
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('open-search');
    await page.click('#open-search');
    await page.mouse.click(640, 700);
    await page.waitForFunction(() => !document.getElementById('search')?.hasAttribute('open'));
    await page.close();
  });

  it('смена размера окна — верх меню снова по низу шапки', async () => {
    const { page } = await open(HEADER);
    await page.click('#open-menu');
    await page.$eval('merfy-section', (el) => {
      if (el instanceof HTMLElement) el.style.height = '120px';
    });
    await page.setViewportSize({ width: 1000, height: 700 });
    await page.waitForFunction(
      () => Math.round(document.getElementById('menu')?.getBoundingClientRect().top ?? 0) === 120,
    );
    await page.close();
  });

  it('«уменьшить движение» — окно открывается и закрывается без анимаций', async () => {
    const { page } = await open(drawer('data-transition="drawer"'), { reducedMotion: true });
    expect(await clickAndRead(page, '#open-drawer', '#drawer')).toEqual([null]);
    expect(await isOpen(page, '#drawer')).toBe(true);
    await page.keyboard.press('Escape');
    expect(await isOpen(page, '#drawer')).toBe(false);
    await page.close();
  });
});

// Место немодального окна (data-anchor): шапка — секции перед <main>, окно секции поверх страниц стоит в конце <body>.
describe('dialog: anchor', () => {
  const PAGE = (anchor: string) => `<merfy-section data-section="shop:header" data-section-id="header" style="display:block;height:80px;background:#fff">
  <button id="loupe" type="button">Лупа</button>
</merfy-section>
<merfy-section data-section="shop:announcement" data-section-id="strip" style="display:block;height:40px;background:#eee">Полоса</merfy-section>
<main style="display:block;height:3000px">Страница</main>
<merfy-section data-section="shop:footer" data-section-id="footer" style="display:block;height:200px">Подвал</merfy-section>
<merfy-section data-section="shop:search" data-section-id="search" style="display:block">
  <div data-behavior="dialog" data-modal="false" data-transition="drop"${anchor}>
    <button data-part="open" id="open-search" type="button">Поиск</button>
    <dialog data-part="content" id="panel" style="margin:0;width:100%;max-width:none"><input aria-label="Поиск"></dialog>
  </div>
</merfy-section>`;
  const press = (page: Page) => page.evaluate(() => document.getElementById('open-search')?.click());
  const topOf = (page: Page) => page.$eval('#panel', (el) => Math.round(el.getBoundingClientRect().top));
  const scrollTo = async (page: Page, top: number) => {
    await page.evaluate((y) => window.scrollTo(0, y), top);
    await page.waitForFunction((y) => Math.round(window.scrollY) === y, top);
  };

  it('data-anchor="header": верх окна — низ последней секции перед <main>, хотя сама секция в конце страницы', async () => {
    const { page, errors } = await open(PAGE(' data-anchor="header"'));
    await press(page);
    expect(await isOpen(page, '#panel')).toBe(true);
    expect(await topOf(page)).toBe(120);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('немодальное окно не запирает прокрутку страницы — как окна «добавлено» у пяти тем', async () => {
    const { page, errors } = await open(PAGE(' data-anchor="header"'));
    await press(page);
    expect(await isOpen(page, '#panel')).toBe(true);
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');
    await scrollTo(page, 300);
    expect(await page.evaluate(() => Math.round(window.scrollY))).toBe(300);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('data-anchor="header": шапка ушла из экрана — окно у верха экрана', async () => {
    const { page } = await open(PAGE(' data-anchor="header"'));
    await scrollTo(page, 1500);
    await press(page);
    expect(await topOf(page)).toBe(0);
    await page.close();
  });

  it('data-anchor="header": шапка частично в экране — окно под её видимым низом', async () => {
    const { page } = await open(PAGE(' data-anchor="header"'));
    await scrollTo(page, 50);
    await press(page);
    expect(await topOf(page)).toBe(70);
    await page.close();
  });

  it('data-anchor="header": смена размера окна — верх снова по низу шапки', async () => {
    const { page } = await open(PAGE(' data-anchor="header"'));
    await press(page);
    await page.$eval('[data-section-id="header"]', (el) => {
      if (el instanceof HTMLElement) el.style.height = '100px';
    });
    await page.setViewportSize({ width: 1000, height: 700 });
    await page.waitForFunction(() => Math.round(document.getElementById('panel')?.getBoundingClientRect().top ?? 0) === 140);
    await page.close();
  });

  it('без data-anchor и с data-anchor="section" — по-прежнему под низом своей секции', async () => {
    for (const attribute of ['', ' data-anchor="section"']) {
      const { page } = await open(PAGE(attribute));
      await press(page);
      const own = await page.$eval('[data-section-id="search"]', (el) => Math.round(el.getBoundingClientRect().bottom));
      expect(await topOf(page)).toBe(own);
      await page.close();
    }
  });

  it('open-on="search-open": лупа шлёт merfy:search:open — открывает; второе нажатие закрывает, без «закрылась-открылась»', async () => {
    const { page, errors } = await open(PAGE(' data-anchor="header" data-open-on="search-open"'));
    await page.evaluate(() => {
      document
        .getElementById('loupe')
        ?.addEventListener('click', () => document.dispatchEvent(new CustomEvent('merfy:search:open', { detail: {} })));
      const panel = document.getElementById('panel');
      if (panel instanceof HTMLDialogElement) {
        // Журнал смен open: «1» — открылось, «0» — закрылось.
        new MutationObserver(() => {
          document.documentElement.dataset.openLog = `${document.documentElement.dataset.openLog ?? ''}${panel.open ? 1 : 0}`;
        }).observe(panel, {
          attributes: true,
          attributeFilter: ['open'],
        });
      }
    });
    await page.click('#loupe');
    await settle(page);
    expect(await isOpen(page, '#panel')).toBe(true);
    expect(await topOf(page)).toBe(120);
    await page.click('#loupe');
    await page.waitForFunction(() => !document.getElementById('panel')?.hasAttribute('open'));
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => document.documentElement.dataset.openLog)).toBe('10');
    expect(errors).toEqual([]);
    await page.close();
  });

  it('без <main> шапки нет — окно у верха экрана', async () => {
    const { page } = await open(PAGE(' data-anchor="header"').replace(/<\/?main[^>]*>/g, ''));
    await press(page);
    expect(await topOf(page)).toBe(0);
    await page.close();
  });
});

// Блок 10, часть 10а (Р10а-6): окно открывает событие SDK — копия на document.
describe('dialog: open-on', () => {
  const PANEL = (
    on: string,
  ) => `<merfy-section data-section="shop:cart-drawer" data-section-id="drawer" style="display:block">
  <div data-behavior="dialog" data-transition="drawer" data-open-on="${on}">
    <dialog data-part="content" id="panel" style="margin:0 0 0 auto;width:400px;height:100vh;max-height:none">
      <button data-part="close" id="close-panel">Скрыть</button>
    </dialog>
  </div>
</merfy-section>`;
  const fire = (page: Page, name: string) =>
    page.evaluate((event) => document.dispatchEvent(new CustomEvent(event, { detail: {} })), name);

  it('cart-open: merfy:cart:open открывает, «Скрыть» закрывает, merfy:cart:add — нет', async () => {
    const { page, errors } = await open(PANEL('cart-open'));
    await fire(page, 'merfy:cart:add');
    expect(await isOpen(page, '#panel')).toBe(false);
    await fire(page, 'merfy:cart:open');
    await settle(page);
    expect(await isOpen(page, '#panel')).toBe(true);
    await page.click('#close-panel');
    await settle(page);
    expect(await isOpen(page, '#panel')).toBe(false);
    expect(errors).toEqual([]);
  });

  it('cart-add: merfy:cart:add открывает; без open-on события окно не открывают', async () => {
    const added = await open(PANEL('cart-add'));
    await fire(added.page, 'merfy:cart:add');
    await settle(added.page);
    expect(await isOpen(added.page, '#panel')).toBe(true);
    const plain = await open(PANEL('none'));
    await fire(plain.page, 'merfy:cart:open');
    await fire(plain.page, 'merfy:cart:add');
    expect(await isOpen(plain.page, '#panel')).toBe(false);
  });

  it('секция со сбоем (блок 12): окно по событию SDK не открывается', async () => {
    const failed = PANEL('cart-add').replace('data-section-id="drawer"', 'data-section-id="drawer" data-merfy-state="failed"');
    const { page, errors } = await open(failed);
    await fire(page, 'merfy:cart:add');
    expect(await isOpen(page, '#panel')).toBe(false);
    expect(errors).toEqual([]);
  });
});

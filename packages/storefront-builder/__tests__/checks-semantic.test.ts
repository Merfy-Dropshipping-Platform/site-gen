// Семантика в местах `html` (html-validate по исходнику) и `browser` (разбор нарушений axe), общий вид находки.
// Настоящий axe в Chromium — `look-browser.test.ts`.
import { describe, expect, it } from 'vitest';
import { semanticBrowser } from '../src/checks/browser/semantic';
import { grouped, inSections, type CheckFinding } from '../src/checks/finding';
import { semanticHtml, withoutTemplates } from '../src/checks/html/semantic';

const page = (body: string): string =>
  `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Магазин</title></head><body>${body}</body></html>`;

const section = (id: string, inner: string): string =>
  `<merfy-section data-section-id="${id}" data-section="shop:${id.split('-')[0]}">${inner}</merfy-section>`;

const byRule = (findings: CheckFinding[], rule: string) => findings.filter((finding) => finding.rule === rule);

describe('общий вид находки', () => {
  const base = { place: 'html', check: 'semantic', rule: 'empty-heading', level: 'warning' } as const;

  it('одинаковые находки секции — одна строка со счётчиком, where — первой', () => {
    const found = grouped([
      { ...base, section: 'faq-1', where: 'h2 первый', text: 'Пустой h2' },
      { ...base, section: 'faq-1', where: 'h2 второй', text: 'Пустой h2' },
      { ...base, section: 'hero-1', where: 'h2', text: 'Пустой h2' },
    ]);
    expect(found).toEqual([
      { ...base, fix: 'silent', section: 'faq-1', where: 'h2 первый', text: 'Пустой h2', count: 2 },
      { ...base, fix: 'silent', section: 'hero-1', where: 'h2', text: 'Пустой h2', count: 1 },
    ]);
  });

  it('отбор по секциям: без списка — все; со списком — только они, находки вне секций не идут', () => {
    const found = grouped([
      { ...base, section: 'faq-1', where: 'h2', text: 'a' },
      { ...base, section: 'hero-1', where: 'h2', text: 'b' },
      { ...base, section: null, where: 'страница', text: 'c' },
    ]);
    expect(inSections(found)).toHaveLength(3);
    expect(inSections(found, ['hero-1']).map((finding) => finding.text)).toEqual(['b']);
  });
});

describe('семантика по HTML (html-validate + своё правило)', () => {
  it('первый заголовок страницы — h2: находка той секции, где он стоит', async () => {
    const found = await semanticHtml(
      page(section('hero-1', '<h2>Простые вещи</h2>') + section('faq-1', '<h3>Вопросы</h3>')),
    );
    expect(byRule(found, 'heading-level')).toEqual([
      {
        place: 'html',
        check: 'semantic',
        rule: 'heading-level',
        level: 'warning',
        section: 'hero-1',
        where: 'h2 «Простые вещи»',
        text: 'Первый заголовок страницы — h2 · главный заголовок страницы делай h1',
        count: 1,
        fix: 'silent',
      },
    ]);
  });

  it('h1, потом h2 — заголовки в порядке, находок нет', async () => {
    const found = await semanticHtml(page(section('hero-1', '<h1>Шарфы</h1>') + section('faq-1', '<h2>Вопросы</h2>')));
    expect(byRule(found, 'heading-level')).toEqual([]);
  });

  it('скачок уровня и второй h1', async () => {
    const found = await semanticHtml(
      page(section('hero-1', '<h1>Шарфы</h1><h3>Скачок</h3>') + section('promo-1', '<h1>Ещё один</h1>')),
    );
    expect(byRule(found, 'heading-level').map((finding) => [finding.section, finding.text])).toEqual([
      ['hero-1', 'Уровень заголовка скачет: ждали h2, стоит h3 · уровни идут по порядку, без пропусков'],
      ['promo-1', 'Второй h1 на странице · h1 один на страницу, остальные — h2'],
    ]);
  });

  it('пустые заголовки в закрытом окне видны (axe в браузере их пропускает) и собраны в одну строку', async () => {
    const found = await semanticHtml(
      page(section('hero-1', '<h1>Шарфы</h1>') + section('popup-1', '<div hidden><h2></h2><h2> </h2></div>')),
    );
    expect(byRule(found, 'empty-heading')).toMatchObject([
      { section: 'popup-1', where: 'h2', count: 2, text: 'Пустой h2 · заполни текст или убери заголовок' },
    ]);
  });

  it('пустой заголовок, текст которого ставит скрипт секции (data-ref), — свой совет: вывести текст в шаблоне', async () => {
    const found = await semanticHtml(
      page(section('hero-1', '<h1>Шарфы</h1>') + section('pick-1', '<h2 data-ref="title"></h2>')),
    );
    expect(byRule(found, 'empty-heading')).toMatchObject([
      {
        section: 'pick-1',
        text: 'Пустой h2 в HTML — текст ставит скрипт секции · поисковик видит пустой заголовок: выведи текст в шаблоне',
      },
    ]);
  });

  it('фото товара с пустым alt — своё правило; картинка для красоты с пустым alt и фото с alt — без находок', async () => {
    const found = await semanticHtml(
      page(
        section(
          'products-1',
          '<h1>Новинки</h1>' +
            '<a href="/product/sharf"><img src="/i/sharf.jpg?v=2" alt="">Шарф</a>' +
            '<div data-product-id="p2"><img src="/i/palto.jpg" alt=""></div>' +
            '<a href="/product/shapka"><img src="/i/shapka.jpg" alt="Шапка"></a>' +
            '<img src="/i/wave.svg" alt="">',
        ),
      ),
    );
    expect(byRule(found, 'product-photo-alt')).toEqual([
      {
        place: 'html',
        check: 'semantic',
        rule: 'product-photo-alt',
        level: 'warning',
        section: 'products-1',
        where: 'img sharf.jpg',
        text: 'Фото товара без alt · alt — название товара: так фото найдут в поиске по картинкам',
        count: 2,
        fix: 'silent',
      },
    ]);
  });

  it('role вместо тега, ссылка и кнопка без текста, картинка без alt', async () => {
    const found = await semanticHtml(
      page(
        section(
          'banner-1',
          '<h1>Баннер</h1><div role="region" aria-label="Куки">Текст</div>' +
            '<a href="/catalog"></a><button type="button"></button><img src="/i/x.png">',
        ),
      ),
    );
    const texts = found.filter((finding) => finding.section === 'banner-1').map((finding) => finding.text);
    expect(texts).toEqual(
      expect.arrayContaining([
        'role вместо тега · используй <section>',
        'Ссылка без текста · добавь текст или aria-label',
        'button без текста · добавь текст или aria-label',
        'Картинка без alt · добавь alt (пустой alt="" — если картинка только для красоты)',
      ]),
    );
  });

  it('элемент вне секций — находка без секции', async () => {
    const found = await semanticHtml(page('<h2>Заголовок вне секции</h2>'));
    expect(byRule(found, 'heading-level')).toMatchObject([{ section: null }]);
  });

  it('содержимое <template> не проверяется: заготовки строк скрипта поисковик не видит (18.11)', async () => {
    const row = '<button type="button" role="radio"><span data-ref="title"></span></button>';
    const found = await semanticHtml(
      page(
        section(
          'checkout-1',
          `<h1>Оформление</h1><div role="radiogroup" aria-label="Доставка"><template>${row}<template>${row}</template></template></div>`,
        ),
      ),
    );
    expect(found).toEqual([]);
    // Та же кнопка вне шаблона — находки есть: правило работает.
    const shown = await semanticHtml(page(section('checkout-1', `<h1>Оформление</h1>${row}`)));
    expect(shown.map((finding) => finding.rule).sort()).toEqual(['prefer-native-element', 'text-content']);
  });
});

describe('другой вид страницы в hidden (18.11)', () => {
  it('h1 скрытого вида — не второй h1; пустой заголовок в скрытом виде — по-прежнему находка', async () => {
    const views = '<div><h1>Мои заказы</h1></div><div hidden><h1>Заказ</h1><h3>Состав</h3></div>';
    expect(await semanticHtml(page(section('orders-1', views)))).toEqual([]);
    const empty = await semanticHtml(page(section('orders-1', '<h1>Мои заказы</h1><div hidden><h2></h2></div>')));
    expect(empty.map((finding) => finding.rule)).toEqual(['empty-heading']);
    // Видимый второй h1 — находка, как раньше.
    const visible = await semanticHtml(page(section('orders-1', '<h1>Мои заказы</h1><h1>Заказ</h1>')));
    expect(visible.map((finding) => finding.rule)).toEqual(['heading-level']);
  });
});

describe('withoutTemplates', () => {
  it('вырезает содержимое шаблонов, вложенных тоже; остальное как было', () => {
    expect(withoutTemplates('<p>a</p><template id="t"><b>x</b><template><i>y</i></template></template><p>b</p>')).toBe(
      '<p>a</p><template id="t"></template><p>b</p>',
    );
    expect(withoutTemplates('<p>без шаблонов</p>')).toBe('<p>без шаблонов</p>');
  });
});

describe('семантика в странице (разбор нарушений axe)', () => {
  it('нарушения — находки места browser по секциям, одинаковые сгруппированы', () => {
    const found = semanticBrowser([
      { rule: 'region', section: 'header-1', tag: 'div', role: null, text: 'Каталог Доставка' },
      { rule: 'region', section: 'header-1', tag: 'nav', role: null, text: '' },
      { rule: 'aria-allowed-role', section: 'hero-1', tag: 'li', role: 'button', text: 'Купить' },
      { rule: 'landmark-one-main', section: null, tag: 'html', role: null, text: '' },
    ]);
    expect(found).toEqual([
      {
        place: 'browser',
        check: 'semantic',
        rule: 'region',
        level: 'warning',
        section: 'header-1',
        where: 'div «Каталог Доставка»',
        text: 'Содержимое вне ориентиров страницы · шапку оберни в <header>, подвал — в <footer>, остальное лежит в <main>',
        count: 2,
        fix: 'silent',
      },
      {
        place: 'browser',
        check: 'semantic',
        rule: 'aria-allowed-role',
        level: 'warning',
        section: 'hero-1',
        where: 'li «Купить»',
        text: 'role="button" не подходит тегу li · убери role или смени тег',
        count: 1,
        fix: 'silent',
      },
      {
        place: 'browser',
        check: 'semantic',
        rule: 'landmark-one-main',
        level: 'warning',
        section: null,
        where: 'html',
        text: 'На странице нет <main> · основное содержимое — в <main>',
        count: 1,
        fix: 'silent',
      },
    ]);
  });

  it('ответ страницы не по форме — ошибка, а не пустой список', () => {
    expect(() => semanticBrowser([{ rule: 'region' }])).toThrow();
    expect(() => semanticBrowser({ violations: [] })).toThrow();
  });
});

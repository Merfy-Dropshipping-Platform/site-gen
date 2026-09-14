import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  injectCheckoutChromeIntoHtml,
  patchCheckoutBlockScheme,
  type AssembledChrome,
} from '../chrome-assembler';

const SITES_ROOT = join(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(join(SITES_ROOT, rel), 'utf8');

/**
 * Баг-репорт 16: «Во вкладке Оформление заказа не применяются цветовые схемы к
 * секциям + не подтягивается логотип из настроек темы».
 *
 * Причина: live-сборка правит verbatim-чекаут в `unifyChromeInDist` (подмена
 * CheckoutHeader пропсами мерчанта + `patchCheckoutBlockScheme` на форму и
 * сводку), а превью конструктора отдавало блоб темы КАК ЕСТЬ — там дефолтная
 * шапка темы (текст вместо логотипа) и секции без класса схемы.
 *
 * Лечение: одна общая функция для обоих путей. Гард фиксирует её контракт,
 * чтобы превью и live не разъехались снова.
 */
describe('injectCheckoutChromeIntoHtml — общий чекаут-хром превью и live', () => {
  // Разметка зеркалит собранную витрину: «Кнопка оплаты» — ВЛОЖЕННАЯ секция
  // формы (CheckoutForm.astro рендерит CheckoutSubmit внутри себя), и класс
  // схемы формы едет именно на неё.
  const THEME_BLOB =
    '<html><body>' +
    '<header class="sticky top-0" data-checkout-slot="header">ТЕМА-ДЕФОЛТ</header>' +
    '<section class="relative w-full bg-[rgb(var(--color-bg))] flex flex-col gap-7" data-block="checkout-form">FORM' +
    '<section class="w-full" data-block="checkout-submit">ОПЛАТИТЬ</section>' +
    '</section>' +
    '<section class="relative w-full flex flex-col gap-6" data-block="checkout-summary">SUM</section>' +
    '<footer data-nt="rose-footer">ПОДВАЛ ТЕМЫ</footer>' +
    '</body></html>';

  const merchantHeader =
    '<header class="sticky top-0" data-checkout-slot="header" data-puck-component-id="CheckoutHeader-1">' +
    '<img src="https://minio/logo.png" alt="Мой магазин"></header>';

  const chrome = (headerHtml: string | null): AssembledChrome => ({
    headerHtml,
    footerHtml: null,
  });

  it('подменяет шапку темы мерчантской (логотип доезжает до чекаута)', () => {
    const out = injectCheckoutChromeIntoHtml(THEME_BLOB, chrome(merchantHeader));
    expect(out).toContain('<img src="https://minio/logo.png"');
    expect(out).not.toContain('ТЕМА-ДЕФОЛТ');
  });

  // Уточнение владельца после третьего круга: «Левая часть от нас. Там только
  // меняется цвет кнопки и юр инфа цвет. Всё остальное наше. А правая часть как
  // в скрине». Поэтому схема «Оформления заказа» доезжает до КНОПКИ, а не до
  // корня формы: на корне (`bg-[rgb(var(--color-bg))]`) она красила бы всю
  // левую колонку.
  it('схема сводки — на сводке, схема формы — на кнопке, независимо', () => {
    const out = injectCheckoutChromeIntoHtml(THEME_BLOB, chrome(merchantHeader), {
      form: { scheme: 'scheme-3' },
      summary: { scheme: 'scheme-5' },
    });
    expect(out).toContain('gap-6 color-scheme-5" data-block="checkout-summary"');
    expect(out).toContain('class="w-full color-scheme-3" data-block="checkout-submit"');
    expect(out).toContain('gap-7" data-block="checkout-form"');
  });

  it('САБОТАЖ: корень формы класс схемы НЕ получает', () => {
    const out = injectCheckoutChromeIntoHtml(THEME_BLOB, chrome(merchantHeader), {
      form: { scheme: 'scheme-3' },
      summary: { scheme: 'scheme-5' },
    });
    const formTag = /<section\b[^>]*\bdata-block="checkout-form"[^>]*>/.exec(out)?.[0] ?? '';
    expect(formTag).not.toMatch(/color-scheme-\d/);
  });

  it('снимает подвал темы: на чекауте подвала нет вообще', () => {
    // 14.09 владелец убрал со страницы оплаты и правовую полосу («УДАЛИТЬ В
    // ЧЕКАУТЕ»), которой прошлый круг вытеснял подвал витрины. Раньше эта
    // проверка требовала обратного — «подвал темы не трогаем»: тогда подменялась
    // ТОЛЬКО полоса, и старый шелл с «Powered by Merfy» оставался (баг 18-А).
    // Теперь снятие безусловное; правило целиком — checkout-footer-legal.spec.ts.
    const out = injectCheckoutChromeIntoHtml(THEME_BLOB, chrome(merchantHeader), {
      form: { scheme: 'scheme-2' },
    });
    expect(out).not.toContain('ПОДВАЛ ТЕМЫ');
    expect(out).not.toMatch(/<footer\b/);
    // Тело страницы при этом цело — сняли подвал, а не половину документа.
    expect(out).toContain('data-block="checkout-form"');
    expect(out).toContain('data-block="checkout-summary"');
    expect(out).toContain('ОПЛАТИТЬ');
  });

  it('идемпотентна: повторный прогон ничего не меняет', () => {
    const once = injectCheckoutChromeIntoHtml(THEME_BLOB, chrome(merchantHeader), {
      form: { scheme: 'scheme-3' },
      summary: { scheme: 'scheme-5' },
    });
    const twice = injectCheckoutChromeIntoHtml(once, chrome(merchantHeader), {
      form: { scheme: 'scheme-3' },
      summary: { scheme: 'scheme-5' },
    });
    expect(twice).toEqual(once);
  });

  it('пустой рендер шапки → блоб остаётся со своей шапкой, схемы всё равно применяются', () => {
    const out = injectCheckoutChromeIntoHtml(THEME_BLOB, chrome(null), {
      form: { scheme: 'scheme-4' },
    });
    expect(out).toContain('ТЕМА-ДЕФОЛТ');
    expect(out).toContain('class="w-full color-scheme-4" data-block="checkout-submit"');
  });

  it('patchCheckoutBlockScheme экспортируется из chrome-assembler (общий модуль)', () => {
    expect(typeof patchCheckoutBlockScheme).toBe('function');
  });
});

/**
 * Одной чистой функции мало: баг 16 был не в ней, а в ТОМ, ЧТО ЕЁ НЕ ЗВАЛИ.
 * Саботаж «вырезать ветку чекаута из preview.controller» чистый гард не ловит —
 * поэтому отдельно сторожим проводку обоих путей.
 */
describe('оба пути реально зовут общую функцию', () => {
  it('превью конструктора доводит чекаут (ветка getChromeKind === checkout)', () => {
    const src = read('src/controllers/preview.controller.ts');
    expect(src).toMatch(/getChromeKind\(route\)\s*===\s*['"]checkout['"]/);
    const branch = src.slice(
      src.search(/getChromeKind\(route\)\s*===\s*['"]checkout['"]/),
    );
    // Внутри ветки: сборка чекаут-хрома + общая доводка со схемами секций.
    expect(branch).toContain("chrome: 'checkout'");
    expect(branch).toContain('injectCheckoutChromeIntoHtml');
    expect(branch).toContain("checkoutBlockIdentity(pagesData, 'CheckoutForm')");
    expect(branch).toContain("checkoutBlockIdentity(pagesData, 'CheckoutSummary')");
  });

  it('live-сборка идёт через ту же функцию, а не через свою копию', () => {
    const src = read('src/themes/v2-live-pages.ts');
    expect(src).toContain('injectCheckoutChromeIntoHtml');
    // Своей подмены <header> в unifyChromeInDist больше нет — иначе пути снова
    // разъедутся при первой же правке одной из копий.
    const unify = src.slice(src.indexOf('export async function unifyChromeInDist'));
    expect(unify).not.toMatch(/next\.replace\(re,\s*\(\)\s*=>\s*checkoutHeader/);
  });
});

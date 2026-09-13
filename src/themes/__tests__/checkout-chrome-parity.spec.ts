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
  const THEME_BLOB =
    '<html><body>' +
    '<header class="sticky top-0" data-checkout-slot="header">ТЕМА-ДЕФОЛТ</header>' +
    '<section class="relative w-full bg-[rgb(var(--color-bg))] flex flex-col gap-7" data-block="checkout-form">FORM</section>' +
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

  it('дописывает цветовые схемы формы и сводки независимо друг от друга', () => {
    const out = injectCheckoutChromeIntoHtml(THEME_BLOB, chrome(merchantHeader), {
      form: 'scheme-3',
      summary: 'scheme-5',
    });
    expect(out).toContain('gap-7 color-scheme-3" data-block="checkout-form"');
    expect(out).toContain('gap-6 color-scheme-5" data-block="checkout-summary"');
  });

  it('не трогает подвал темы (у чекаута свой хром без Footer)', () => {
    const out = injectCheckoutChromeIntoHtml(THEME_BLOB, chrome(merchantHeader), {
      form: 'scheme-2',
    });
    expect(out).toContain('ПОДВАЛ ТЕМЫ');
  });

  it('идемпотентна: повторный прогон ничего не меняет', () => {
    const once = injectCheckoutChromeIntoHtml(THEME_BLOB, chrome(merchantHeader), {
      form: 'scheme-3',
      summary: 'scheme-5',
    });
    const twice = injectCheckoutChromeIntoHtml(once, chrome(merchantHeader), {
      form: 'scheme-3',
      summary: 'scheme-5',
    });
    expect(twice).toEqual(once);
  });

  it('пустой рендер шапки → блоб остаётся со своей шапкой, схемы всё равно применяются', () => {
    const out = injectCheckoutChromeIntoHtml(THEME_BLOB, chrome(null), {
      form: 'scheme-4',
    });
    expect(out).toContain('ТЕМА-ДЕФОЛТ');
    expect(out).toContain('gap-7 color-scheme-4" data-block="checkout-form"');
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
    expect(branch).toContain("checkoutBlockScheme(pagesData, 'CheckoutForm')");
    expect(branch).toContain("checkoutBlockScheme(pagesData, 'CheckoutSummary')");
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

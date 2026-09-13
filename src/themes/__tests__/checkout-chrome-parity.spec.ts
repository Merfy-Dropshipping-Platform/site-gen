import {
  injectCheckoutChromeIntoHtml,
  patchCheckoutBlockScheme,
  type AssembledChrome,
} from '../chrome-assembler';

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

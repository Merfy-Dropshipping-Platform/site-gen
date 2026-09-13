import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  injectCheckoutChromeIntoHtml,
  checkoutBlockIdentity,
  checkoutBlockScheme,
} from '../chrome-assembler';

const SITES_ROOT = join(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(join(SITES_ROOT, rel), 'utf8');

/**
 * Баг-репорт 18-В (повтор 16): «Во вкладке Оформление заказа не применяются
 * цветовые схемы к секциям».
 *
 * Замер «до» (прод, 2026-09-13, пять витрин на 9871f205, протокол конструктора
 * init+update-block против `/api/sites/:id/preview?page=page-checkout`):
 *   тема      id секции в DOM   схема до        схема после     вердикт
 *   rose      НЕТ               color-scheme-2  color-scheme-2  НЕ ПРИМЕНИЛАСЬ
 *   vanilla   НЕТ               color-scheme-2  color-scheme-2  НЕ ПРИМЕНИЛАСЬ
 *   flux      НЕТ               color-scheme-2  color-scheme-2  НЕ ПРИМЕНИЛАСЬ
 *   satin     НЕТ               color-scheme-2  color-scheme-2  НЕ ПРИМЕНИЛАСЬ
 *   bloom     НЕТ               color-scheme-2  color-scheme-2  НЕ ПРИМЕНИЛАСЬ
 *
 * Причина — НЕ в схеме. Фикс 16 (`patchCheckoutBlockScheme`) чинил ПЕРВИЧНЫЙ
 * рендер страницы, и он работает: класс на секциях есть. Но мерчант меняет
 * настройку без перезагрузки — конструктор шлёт `update-block`, а агент превью
 * ищет секцию строго по `[data-puck-component-id="<id>"]`. У verbatim-чекаута
 * темы рисуют `<CheckoutForm />` БЕЗ пропсов, поэтому id на мега-блоках не
 * было ни в превью, ни на витрине: `el === null` → «keep old DOM», и правка
 * молча не доезжала. Тот же атрибут требует `isValidBlockHtml` от ответа
 * `/preview/block`.
 *
 * Лечение: id блока из ревизии проставляется тем же общим кодом, что и схема
 * (`injectCheckoutChromeIntoHtml`), — значит одинаково в превью и на витрине.
 */
const BLOB =
  '<html><body>' +
  '<header class="sticky top-0" data-checkout-slot="header">ШАПКА</header>' +
  '<section class="relative w-full flex flex-col gap-7" data-block="checkout-form">FORM</section>' +
  '<section class="relative w-full flex flex-col gap-6" data-block="checkout-summary">SUM</section>' +
  '</body></html>';

const chrome = { headerHtml: null, footerHtml: null };

describe('секции чекаута несут id блока — иначе правка настройки не доезжает (баг 18-В)', () => {
  it('проставляет data-puck-component-id из ревизии обеим секциям', () => {
    const out = injectCheckoutChromeIntoHtml(BLOB, chrome, {
      form: { id: 'CheckoutForm-1', scheme: 'scheme-4' },
      summary: { id: 'CheckoutSummary-1', scheme: 'scheme-5' },
    });
    expect(out).toContain('data-puck-component-id="CheckoutForm-1"');
    expect(out).toContain('data-puck-component-id="CheckoutSummary-1"');
    // Схема из фикса 16 продолжает работать.
    expect(out).toContain('gap-7 color-scheme-4"');
    expect(out).toContain('gap-6 color-scheme-5"');
  });

  it('id и схема ставятся независимо: без схемы id всё равно есть', () => {
    const out = injectCheckoutChromeIntoHtml(BLOB, chrome, {
      form: { id: 'CheckoutForm-7' },
    });
    expect(out).toContain('data-puck-component-id="CheckoutForm-7"');
    expect(out).not.toContain('color-scheme-');
  });

  it('идемпотентна: повторный прогон не плодит атрибут', () => {
    const ids = {
      form: { id: 'CheckoutForm-1', scheme: 'scheme-4' },
      summary: { id: 'CheckoutSummary-1', scheme: 'scheme-2' },
    };
    const once = injectCheckoutChromeIntoHtml(BLOB, chrome, ids);
    const twice = injectCheckoutChromeIntoHtml(once, chrome, ids);
    expect(twice).toEqual(once);
    expect(once.match(/data-puck-component-id="CheckoutForm-1"/g)).toHaveLength(1);
  });

  it('уже проставленный темой id не подменяется', () => {
    const blob =
      '<section class="x" data-puck-component-id="ТЕМА" data-block="checkout-form">F</section>';
    const out = injectCheckoutChromeIntoHtml(blob, chrome, {
      form: { id: 'CheckoutForm-1' },
    });
    expect(out).toContain('data-puck-component-id="ТЕМА"');
    expect(out).not.toContain('CheckoutForm-1');
  });

  it('id блока читается из ревизии по обоим ключам страницы', () => {
    const constructorRevision = {
      'page-checkout': {
        content: [
          { type: 'CheckoutForm', props: { id: 'CheckoutForm-111', colorScheme: 'scheme-3' } },
        ],
      },
    };
    expect(checkoutBlockIdentity(constructorRevision, 'CheckoutForm')).toEqual({
      id: 'CheckoutForm-111',
      scheme: 'scheme-3',
    });
    const legacyRevision = {
      checkout: {
        content: [{ type: 'CheckoutSummary', props: { id: 'CS-9' } }],
      },
    };
    expect(checkoutBlockIdentity(legacyRevision, 'CheckoutSummary')).toEqual({
      id: 'CS-9',
      scheme: undefined,
    });
    // Прежний хелпер схемы продолжает работать (его зовут старые гарды).
    expect(checkoutBlockScheme(constructorRevision, 'CheckoutForm')).toBe('scheme-3');
  });

  it('в ревизии нет чекаут-блока → ничего не проставляем (без выдуманных id)', () => {
    expect(checkoutBlockIdentity({}, 'CheckoutForm')).toEqual({
      id: undefined,
      scheme: undefined,
    });
    const out = injectCheckoutChromeIntoHtml(BLOB, chrome, {});
    expect(out).not.toContain('data-puck-component-id');
  });
});

/**
 * Проводка. Чистая функция без вызова = баг 16 дословно, поэтому сторожим оба
 * пути и сам контракт агента превью: если из агента уберут поиск по
 * `data-puck-component-id`, атрибут на чекауте перестанет что-либо значить.
 */
describe('id доезжает обоими путями и его правда ждёт агент превью', () => {
  it('превью конструктора отдаёт id вместе со схемой', () => {
    const src = read('src/controllers/preview.controller.ts');
    const branch = src.slice(
      src.search(/getChromeKind\(route\)\s*===\s*['"]checkout['"]/),
    );
    expect(branch).toContain("checkoutBlockIdentity(pagesData, 'CheckoutForm')");
    expect(branch).toContain("checkoutBlockIdentity(pagesData, 'CheckoutSummary')");
  });

  it('сборка витрины отдаёт id вместе со схемой', () => {
    const src = read('src/themes/v2-live-pages.ts');
    expect(src).toContain("checkoutBlockIdentity(pagesData, 'CheckoutForm')");
    expect(src).toContain("checkoutBlockIdentity(pagesData, 'CheckoutSummary')");
  });

  it('агент превью ищет секцию и проверяет ответ ровно по этому атрибуту', () => {
    const agent = read('src/services/preview.service.ts');
    expect(agent).toContain(
      "document.querySelector('[data-puck-component-id=\"' + blockId + '\"]')",
    );
    expect(agent).toContain("'[data-puck-component-id=\"' + expectBlockId + '\"]'");
  });
});

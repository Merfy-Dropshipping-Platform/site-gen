/**
 * @jest-environment jsdom
 *
 * CheckoutSubmit — ТОЧКА 2 (16.09, b31-checkout).
 *
 * Владелец: «пусть [кнопка «Оплатить»] просто отображается активной, как
 * будто данные внесены и готовится оплачивать, а не неактивный статус» —
 * дословно про ВИД в конструкторе и превью. Живой сайт обязан вести себя как
 * раньше: кнопка серая, пока форма не заполнена, и клик по ней ничего не
 * отправляет.
 *
 * МЕХАНИЗМ. `refresh()` в CheckoutSubmit.astro теперь читает
 * `window.parent !== window` (тот же признак «мы в iframe превью», которым
 * уже пользуется `cart-added-modal.ts:goToCheckout`) и, если это так,
 * ПРИНУДИТЕЛЬНО держит `button.disabled = false` — визуально кнопка выглядит
 * активной независимо от `canSubmit()`. Реальная защита не в DOM-атрибуте
 * disabled, а в клик-хендлере: `if (!canSubmit()) return;` стоит там
 * безусловно, без какой-либо оглядки на inIframe, и остаётся первой строкой
 * обработчика клика.
 *
 * Скрипт извлекается из .astro и исполняется в jsdom (как в config/promo/
 * cdek/auth-gate тестах этого же блока). Мок `window.parent` — тот же приём,
 * что уже используется в `product-variant-anchor.dom.test.ts:enterIframe`.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ASTRO = join(__dirname, '..', 'blocks', 'CheckoutSubmit', 'CheckoutSubmit.astro');
const ASTRO_SRC = readFileSync(ASTRO, 'utf8');

function inlineScriptBody(src: string): string {
  const m = /<script\b[^>]*>([\s\S]*?)<\/script>/i.exec(src);
  if (!m) throw new Error('no <script> in CheckoutSubmit.astro');
  return m[1];
}

const SCRIPT = inlineScriptBody(ASTRO_SRC);

/** Пустая форма: ни одного заполненного поля, доставка не выбрана. */
function mountEmptyDom(): HTMLElement {
  document.body.innerHTML = `
    <section data-block="checkout-submit" data-puck-component-id="cs-1">
      <div data-checkout-submit-error role="alert" hidden></div>
      <button type="button" data-checkout-submit>Оформить — —</button>
    </section>
    <div data-checkout-delivery></div>
    <div data-checkout-field="email"><input value="" /></div>
    <div data-checkout-field="phone"><input value="" /></div>
    <div data-checkout-field="city"><input value="" /></div>
    <div data-checkout-field="street"><input value="" /></div>`;
  return document.querySelector('[data-block="checkout-submit"]') as HTMLElement;
}

/** Заполненная форма — контрольная группа: кнопка активна в обоих режимах. */
function mountFilledDom(): HTMLElement {
  document.body.innerHTML = `
    <section data-block="checkout-submit" data-puck-component-id="cs-1">
      <div data-checkout-submit-error role="alert" hidden></div>
      <button type="button" data-checkout-submit>Оформить — —</button>
    </section>
    <div data-checkout-delivery data-selected-city-fias-id="fias-1"></div>
    <div data-checkout-field="email"><input value="a@b.ru" /></div>
    <div data-checkout-field="phone"><input value="+79990000000" /></div>
    <div data-checkout-field="firstName"><input value="Иван" /></div>
    <div data-checkout-field="lastName"><input value="Петров" /></div>
    <div data-checkout-field="city"><input value="Москва" /></div>
    <div data-checkout-field="street"><input value="Ленина" /></div>
    <div data-checkout-field="building"><input value="1" /></div>`;
  return document.querySelector('[data-block="checkout-submit"]') as HTMLElement;
}

function runScript(section: HTMLElement, script: string = SCRIPT) {
  (window as any).__merfyRoot = () => section;
  // eslint-disable-next-line no-new-func
  new Function('buttonText', 'loadingText', 'successRedirectUrl', 'blockId', script)(
    'Оформить — {total}',
    'Оформляем…',
    '/checkout/result',
    'cs-1',
  );
}

function selectDelivery(detail: Record<string, unknown> | null) {
  if (!detail) return;
  document.dispatchEvent(new CustomEvent('checkout:delivery-changed', { detail }));
}

const SELF_PICKUP = { type: 'self_pickup', label: 'Самовывоз', costCents: 0, tariffCode: null };

function baseCart() {
  (window as any).cartStore = {
    getItems: () => [{ id: 'i1', productId: 'p1', quantity: 1, unitPriceCents: 100000 }],
    getTotal: () => 100000,
    syncToServer: jest.fn(async () => 'cart_new'),
  };
}

/** Мок iframe-родителя — как в product-variant-anchor.dom.test.ts:enterIframe. */
function enterIframe(): void {
  Object.defineProperty(window, 'parent', {
    value: { postMessage: jest.fn() },
    configurable: true,
  });
}

function exitIframe(): void {
  Object.defineProperty(window, 'parent', { value: window, configurable: true });
}

function cleanup() {
  delete (window as any).cartStore;
  delete (window as any).fetch;
  delete (window as any).__merfyRoot;
  delete (window as any).__MERFY_CONFIG__;
  exitIframe();
}

const btnOf = (section: HTMLElement) =>
  section.querySelector('[data-checkout-submit]') as HTMLButtonElement;

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  baseCart();
  (window as any).__MERFY_CONFIG__ = { shopId: 'shop1', apiUrl: 'https://gateway.test/api' };
  (window as any).fetch = jest.fn(() => Promise.resolve({ ok: true, json: async () => ({}) }));
  delete (window as any).location;
  (window as any).location = { origin: 'https://shop.test', href: '' };
});
afterEach(cleanup);

describe('ДО ФИКСА (эталон вне iframe — не должен был и не должен меняться)', () => {
  it('живой сайт, пустая форма → кнопка ЗАМЕТНО disabled (как всегда было)', () => {
    exitIframe(); // window.parent === window — обычная витрина
    const section = mountEmptyDom();
    runScript(section);
    expect(btnOf(section).disabled).toBe(true);
  });

  it('живой сайт, форма заполнена → кнопка enabled', () => {
    exitIframe();
    const section = mountFilledDom();
    runScript(section);
    selectDelivery(SELF_PICKUP);
    expect(btnOf(section).disabled).toBe(false);
  });
});

describe('ТОЧКА 2: конструктор/превью — кнопка ВСЕГДА выглядит активной', () => {
  it('iframe (превью), пустая форма → кнопка НЕ disabled (замер «после»)', () => {
    enterIframe();
    const section = mountEmptyDom();
    runScript(section);
    expect(btnOf(section).disabled).toBe(false);
  });

  it('iframe (превью), форма заполнена → тоже НЕ disabled (не регрессирует)', () => {
    enterIframe();
    const section = mountFilledDom();
    runScript(section);
    selectDelivery(SELF_PICKUP);
    expect(btnOf(section).disabled).toBe(false);
  });

  it('iframe, поле поменяли на пустое (input-событие) → кнопка ОСТАЁТСЯ активной на вид', () => {
    // refresh() перевызывается на каждый input/change — гейт визуально не
    // должен «мигать» disabled, пока идёт живое редактирование в конструкторе.
    enterIframe();
    const section = mountFilledDom();
    runScript(section);
    selectDelivery(SELF_PICKUP);
    expect(btnOf(section).disabled).toBe(false);
    const emailInput = document.querySelector(
      '[data-checkout-field="email"] input',
    ) as HTMLInputElement;
    emailInput.value = '';
    emailInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(btnOf(section).disabled).toBe(false);
  });
});

describe('ТОЧКА 2: разведение «вид» и «реальная защита» — клик в превью ничего не отправляет', () => {
  it('iframe, пустая форма, кнопка НЕ disabled, но клик НЕ идёт на бэкенд', async () => {
    enterIframe();
    const section = mountEmptyDom();
    runScript(section);
    const btn = btnOf(section);
    expect(btn.disabled).toBe(false); // выглядит активной…

    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 10));

    // …но canSubmit() внутри клик-хендлера безусловно вернул false — до fetch
    // дело не дошло. Реальная защита не завязана на DOM-атрибут disabled.
    expect((window as any).fetch).not.toHaveBeenCalled();
  });

  it('живой сайт (контроль): тот же клик по заведомо disabled-кнопке тоже ничего не шлёт', async () => {
    exitIframe();
    const section = mountEmptyDom();
    runScript(section);
    const btn = btnOf(section);
    expect(btn.disabled).toBe(true);

    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 10));
    expect((window as any).fetch).not.toHaveBeenCalled();
  });
});

describe('САБОТАЖ', () => {
  it('САБОТАЖ: убрали проверку inIframe из refresh() → превью снова показывает серую кнопку', () => {
    // Возвращаем refresh() к виду ДО фикса — предикат обязан покраснеть.
    const sabotaged = SCRIPT.replace(
      /var inIframe = window\.parent && window\.parent !== window;\s*\n\s*button\.disabled = inIframe \? false : !canSubmit\(\);/,
      'button.disabled = !canSubmit();',
    );
    expect(sabotaged).not.toEqual(SCRIPT);
    enterIframe();
    const section = mountEmptyDom();
    runScript(section, sabotaged);
    // Это и есть «красный с числом»: без фикса кнопка в превью снова disabled.
    expect(btnOf(section).disabled).toBe(true);
  });

  it('САБОТАЖ: подменили canSubmit() на всегда true → живой сайт остаётся под угрозой, тест это ловит', () => {
    // Демонстрация того, что БЕЗ строки `if (!canSubmit()) return;` защита
    // живого сайта пробивается — сабботаж намеренно её вырезает.
    const sabotaged = SCRIPT.replace('if (!canSubmit()) return;\n      clearError();', 'clearError();');
    expect(sabotaged).not.toEqual(SCRIPT);
    exitIframe();
    const section = mountEmptyDom();
    runScript(section, sabotaged);
    const btn = btnOf(section);
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return new Promise((resolve) => {
      setTimeout(() => {
        // С вырезанной защитой пустая форма ДОХОДИТ до fetch — ровно то, чего
        // владелец просил не допускать. Гард без сабботажа (тест выше) это
        // предотвращает; этот тест доказывает, что гард СТОРОЖИТ именно эту
        // строку, а не что-то смежное.
        expect((window as any).fetch).toHaveBeenCalled();
        resolve(undefined);
      }, 10);
    });
  });

  it('САБОТАЖ-КАЛИБРОВКА: правка НЕсторожимого (текст загрузки) не трогает видимость гейта', () => {
    const sabotaged = SCRIPT; // buttonText/loadingText приходят параметром, не из SCRIPT
    enterIframe();
    const section = mountEmptyDom();
    runScript(section, sabotaged);
    expect(btnOf(section).disabled).toBe(false);
    // сам факт: перекраска лейбла (другой параметр) не влияет на disabled
    (window as any).__merfyRoot = () => section;
    // eslint-disable-next-line no-new-func
    new Function('buttonText', 'loadingText', 'successRedirectUrl', 'blockId', sabotaged)(
      'Купить — {total}',
      'Секунду…',
      '/checkout/result',
      'cs-1',
    );
    expect(btnOf(section).disabled).toBe(false);
  });
});

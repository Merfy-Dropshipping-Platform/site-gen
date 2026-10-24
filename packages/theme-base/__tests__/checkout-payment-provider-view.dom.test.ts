/**
 * @jest-environment jsdom
 *
 * CheckoutPayment — формы карты на витрине нет ни при какой платёжке магазина.
 *
 * Покупатель выбирает способ (карта, СБП, Sber Pay, T-Pay), а данные вводит на
 * странице платёжки, куда его уводит CheckoutSubmit по confirmationUrl. Поэтому
 * независимо от `activeProvider` из GET .../billing/shops/:shopId/payment-config/public
 * ('yookassa' | 'tochka' | 'robokassa' | 'prodamus' | null | поле отсутствует):
 *   - в разметке блока нет полей карты, предупреждения и статуса модуля;
 *   - SDK ЮKassa (токенизация) не грузится, `__checkoutTokenizeCard` не объявляется;
 *   - способ выбирается и уходит событием `checkout:payment-method-changed`;
 *   - скрытие неподключённых способов по `enabledMethods` работает как раньше.
 *
 * Скрипт извлекается из .astro и исполняется в jsdom (как в checkout-submit-*).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { astroInlineRunners } from './helpers/astro-inline-script';

const ASTRO = join(__dirname, '..', 'blocks', 'CheckoutPayment', 'CheckoutPayment.astro');
const SDK_SRC = 'https://yookassa.ru/checkout-widget/v1/checkout-widget.js';

function mountPaymentDom(): HTMLElement {
  document.body.innerHTML = `
    <section data-block="checkout-payment" data-puck-component-id="cp-1">
      <div data-checkout-payment-list>
        <label data-payment-key="bank_card" data-payment-method="bank_card" data-payment-selected="true">
          <input type="radio" name="paymentMethod" value="bank_card" checked data-payment-radio />
          <span data-payment-radio-dot></span>
        </label>
        <label data-payment-key="sbp" data-payment-method="sbp" data-payment-selected="false">
          <input type="radio" name="paymentMethod" value="sbp" data-payment-radio />
          <span data-payment-radio-dot></span>
        </label>
        <label data-payment-key="sberbank" data-payment-method="sberbank" data-payment-selected="false">
          <input type="radio" name="paymentMethod" value="sberbank" data-payment-radio />
          <span data-payment-radio-dot></span>
        </label>
        <label data-payment-key="tinkoff_bank" data-payment-method="tinkoff_bank" data-payment-selected="false">
          <input type="radio" name="paymentMethod" value="tinkoff_bank" data-payment-radio />
          <span data-payment-radio-dot></span>
        </label>
      </div>
    </section>`;
  return document.querySelector('[data-block="checkout-payment"]') as HTMLElement;
}

function runScript(section: HTMLElement) {
  (window as any).__merfyRoot = () => section;
  astroInlineRunners(ASTRO)[0].run({ blockId: 'cp-1' });
}

function setConfig() {
  (window as any).__MERFY_CONFIG__ = { shopId: 'shop1', apiUrl: 'https://gateway.test/api' };
}

/** Мок fetch payment-config/public — один и тот же ответ на каждый вызов. */
function mockPaymentConfig(data: Record<string, unknown> | null) {
  (window as any).fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: async () => ({ success: true, data }) }),
  );
}

function flush() {
  return new Promise((r) => setTimeout(r, 10));
}

function cleanup() {
  delete (window as any).fetch;
  delete (window as any).__merfyRoot;
  delete (window as any).__MERFY_CONFIG__;
  delete (window as any).__checkoutTokenizeCard;
  delete (window as any).__YOOKASSA_SDK_READY__;
  delete (window as any).__YOOKASSA_SDK_LOADING__;
  delete (window as any).__YOOKASSA_SHOP_ID__;
  document.head.querySelectorAll(`script[src="${SDK_SRC}"]`).forEach((el) => el.remove());
}

describe('CheckoutPayment — разметка без формы карты', () => {
  const src = readFileSync(ASTRO, 'utf8');

  it.each([
    'data-card-form-wrapper',
    'data-checkout-card-form',
    'data-card-field',
    'data-card-warning',
    'data-payment-sdk-status',
    'autocomplete="cc-number"',
    'autocomplete="cc-csc"',
    'Номер карты',
    'Срок действия',
    'Имя на карте',
    'cardForm',
    'warningText',
    'nameOnCardEnabled',
  ])('в блоке нет «%s»', (needle) => {
    // Единственное допустимое упоминание cardForm — комментарий про старые ревизии.
    const withoutComments = src.replace(/^\/\/.*$/gm, '');
    expect(withoutComments).not.toContain(needle);
  });

  it('SDK ЮKassa и токенизация карты из блока удалены', () => {
    expect(src).not.toContain('checkout-widget');
    expect(src).not.toContain('YooMoneyCheckout');
    expect(src).not.toContain('__checkoutTokenizeCard');
  });
});

describe.each([
  ['yookassa', { yookassaEnabled: true, yookassaShopId: 'yk_1', enabledMethods: ['bank_card', 'sbp', 'sberbank', 'tinkoff_bank'], activeProvider: 'yookassa' }],
  ['tochka', { yookassaEnabled: false, yookassaShopId: null, activeProvider: 'tochka' }],
  ['robokassa', { yookassaEnabled: false, yookassaShopId: null, activeProvider: 'robokassa' }],
  ['prodamus', { yookassaEnabled: false, yookassaShopId: null, activeProvider: 'prodamus' }],
  ['не подключена (null)', { yookassaEnabled: false, yookassaShopId: null, activeProvider: null }],
  ['прод без поля activeProvider', { yookassaEnabled: true, yookassaShopId: 'yk_prod', enabledMethods: ['bank_card', 'sbp', 'sberbank', 'tinkoff_bank'] }],
])('CheckoutPayment — платёжка: %s', (_name, config) => {
  afterEach(cleanup);

  it('SDK ЮKassa не грузится, токенайзер не объявлен, формы карты в DOM нет', async () => {
    setConfig();
    mockPaymentConfig(config);
    const section = mountPaymentDom();
    runScript(section);
    await flush();

    expect(document.head.querySelector(`script[src="${SDK_SRC}"]`)).toBeNull();
    expect((window as any).__YOOKASSA_SDK_READY__).toBeUndefined();
    expect((window as any).__checkoutTokenizeCard).toBeUndefined();
    expect(section.querySelector('[data-card-form-wrapper]')).toBeNull();
    expect(section.querySelector('[data-card-field]')).toBeNull();
  });

  it.each(['sbp', 'sberbank', 'tinkoff_bank', 'bank_card'])(
    'выбор «%s» отмечается и уходит событием checkout:payment-method-changed',
    async (key) => {
      setConfig();
      mockPaymentConfig(config);
      const section = mountPaymentDom();
      runScript(section);
      await flush();

      const events: string[] = [];
      document.addEventListener('checkout:payment-method-changed', (e) => {
        events.push((e as CustomEvent).detail.method);
      });
      const radio = section.querySelector(`input[value="${key}"]`) as HTMLInputElement;
      radio.checked = true;
      radio.dispatchEvent(new Event('change'));

      const label = section.querySelector(`[data-payment-key="${key}"]`) as HTMLElement;
      expect(label.getAttribute('data-payment-selected')).toBe('true');
      expect(events).toEqual([key]);
    },
  );
});

describe('CheckoutPayment — способы по подключению в ЮKassa', () => {
  afterEach(cleanup);

  it('enabledMethods=[bank_card] → остальные способы скрыты', async () => {
    setConfig();
    mockPaymentConfig({ yookassaEnabled: true, yookassaShopId: 'yk_prod', enabledMethods: ['bank_card'] });
    const section = mountPaymentDom();
    runScript(section);
    await flush();

    const display = (key: string) =>
      (section.querySelector(`[data-payment-key="${key}"]`) as HTMLElement).style.display;
    expect(display('bank_card')).toBe('');
    expect(display('sbp')).toBe('none');
    expect(display('sberbank')).toBe('none');
    expect(display('tinkoff_bank')).toBe('none');
  });

  it('выбранный способ не подключён → выбор переходит на первый подключённый', async () => {
    setConfig();
    mockPaymentConfig({ yookassaEnabled: true, yookassaShopId: 'yk_1', enabledMethods: ['sbp', 'sberbank'] });
    const section = mountPaymentDom();
    runScript(section);
    await flush();

    expect((section.querySelector('input[value="sbp"]') as HTMLInputElement).checked).toBe(true);
    expect(
      (section.querySelector('[data-payment-key="sbp"]') as HTMLElement).getAttribute('data-payment-selected'),
    ).toBe('true');
  });

  it('enabledMethods нет в ответе → все способы остаются как есть', async () => {
    setConfig();
    mockPaymentConfig({ yookassaEnabled: false, yookassaShopId: null });
    const section = mountPaymentDom();
    runScript(section);
    await flush();

    section.querySelectorAll<HTMLElement>('[data-payment-key]').forEach((el) => {
      expect(el.style.display).toBe('');
    });
  });
});

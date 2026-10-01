/**
 * @jest-environment jsdom
 *
 * CheckoutPayment + CheckoutSubmit вместе — сквозной сабмит под активную
 * платёжку магазина (спец 3а.2). checkout-payment-provider-view.dom.test.ts
 * проверяет только ВИД (поля карты/SDK); этот файл проверяет РЕАЛЬНУЮ отправку
 * заказа: CheckoutSubmit читает `window.__checkoutTokenizeCard`, который
 * объявляет CheckoutPayment, — здесь оба инлайн-скрипта исполняются вместе,
 * как на живой странице (мега-блок CheckoutForm рендерит их друг за другом).
 *
 * Инвариант спец 3а.1/3а.2 для tochka/robokassa/prodamus:
 *   - `paymentToken` НЕ попадает в тело POST /create-payment (SDK ЮKassa не
 *     грузился, `__checkoutTokenizeCard` возвращает '');
 *   - покупатель всё равно уходит на `confirmationUrl` из ответа — платёжка
 *     сама решает, что показать (страница оплаты Точки/Робокассы/Prodamus).
 * Контрольный кейс yookassa — paymentToken ПРИСУТСТВУЕТ (поведение не менялось).
 */
import { join } from 'path';
import { astroInlineRunners } from './helpers/astro-inline-script';

const PAYMENT_ASTRO = join(__dirname, '..', 'blocks', 'CheckoutPayment', 'CheckoutPayment.astro');
const SUBMIT_ASTRO = join(__dirname, '..', 'blocks', 'CheckoutSubmit', 'CheckoutSubmit.astro');
const CONFIRMATION_URL = 'https://pay.test/provider-page';

function mountDom(): { paymentSection: HTMLElement; submitSection: HTMLElement } {
  document.body.innerHTML = `
    <section data-block="checkout-payment" data-puck-component-id="cp-1">
      <div data-checkout-payment-list>
        <label data-payment-key="bank_card" data-payment-method="bank_card" data-payment-selected="true">
          <input type="radio" name="paymentMethod" value="bank_card" checked data-payment-radio />
          <span data-payment-radio-dot></span>
        </label>
        <div data-card-form-wrapper data-checkout-card-form>
          <input data-card-field="number" value="4111111111111111" />
          <input data-card-field="expiry" value="12/30" />
          <input data-card-field="cvc" value="123" />
          <input data-card-field="nameOnCard" />
          <p data-payment-sdk-status hidden></p>
        </div>
      </div>
    </section>
    <section data-block="checkout-submit" data-puck-component-id="cs-1">
      <div data-checkout-submit-error role="alert" hidden></div>
      <button data-checkout-submit disabled>Оформить — —</button>
    </section>
    <div data-checkout-delivery data-selected-city-fias-id="fias-1"></div>
    <div data-checkout-field="email"><input value="a@b.ru" /></div>
    <div data-checkout-field="phone"><input value="+79990000000" /></div>
    <div data-checkout-field="firstName"><input value="Иван" /></div>
    <div data-checkout-field="lastName"><input value="Петров" /></div>
    <div data-checkout-field="fullName"><input value="" /></div>
    <div data-checkout-field="city"><input value="Москва" /></div>
    <div data-checkout-field="postalCode"><input value="101000" /></div>
    <div data-checkout-field="street"><input value="Ленина" /></div>
    <div data-checkout-field="building"><input value="1" /></div>
    <div data-checkout-field="apartment"><input value="5" /></div>
    <div data-checkout-field="country"><input value="Россия" /></div>`;
  return {
    paymentSection: document.querySelector('[data-block="checkout-payment"]') as HTMLElement,
    submitSection: document.querySelector('[data-block="checkout-submit"]') as HTMLElement,
  };
}

const SELF_PICKUP = { type: 'self_pickup', label: 'Самовывоз', costCents: 0, tariffCode: null };

function selectDelivery(detail: Record<string, unknown>) {
  document.dispatchEvent(new CustomEvent('checkout:delivery-changed', { detail }));
}

function baseCart() {
  (window as any).cartStore = {
    getItems: () => [{ id: 'i1', productId: 'p1', quantity: 1, unitPriceCents: 100000 }],
    getTotal: () => 100000,
    syncToServer: jest.fn(async () => 'cart_new'),
  };
}

function flush() {
  return new Promise((r) => setTimeout(r, 10));
}

const bodyOf = (mock: jest.Mock, re: RegExp) => {
  const call = mock.mock.calls.find((c) => re.test(String(c[0])));
  return call ? JSON.parse((call[1] as any).body) : null;
};

/** Общий fetch-мок на payment-config/public + всю цепочку сабмита. */
function combinedFetchMock(paymentConfigData: Record<string, unknown> | null): jest.Mock {
  return jest.fn((url: string) => {
    if (/\/payment-config\/public$/.test(url))
      return Promise.resolve({ ok: true, json: async () => ({ success: true, data: paymentConfigData }) });
    if (/\/customer$/.test(url)) return Promise.resolve({ ok: true, json: async () => ({}) });
    if (/\/address$/.test(url)) return Promise.resolve({ ok: true, json: async () => ({}) });
    if (/\/checkout$/.test(url))
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: { orderId: 'o1' } }) });
    if (/\/create-payment$/.test(url))
      return Promise.resolve({ ok: true, json: async () => ({ data: { confirmationUrl: CONFIRMATION_URL } }) });
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

function cleanup() {
  delete (window as any).cartStore;
  delete (window as any).fetch;
  delete (window as any).__merfyRoot;
  delete (window as any).__MERFY_CONFIG__;
  delete (window as any).__checkoutTokenizeCard;
  delete (window as any).__YOOKASSA_SDK_READY__;
  delete (window as any).__YOOKASSA_SDK_LOADING__;
  delete (window as any).__YOOKASSA_SHOP_ID__;
  delete (window as any).YooMoneyCheckout;
  document.head.querySelectorAll('script[src^="https://yookassa.ru"]').forEach((el) => el.remove());
}

describe('CheckoutPayment + CheckoutSubmit — сквозной сабмит под активную платёжку', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    baseCart();
    delete (window as any).location;
    (window as any).location = { origin: 'https://shop.test', href: '' };
  });
  afterEach(cleanup);

  it.each(['tochka', 'robokassa', 'prodamus'])(
    'activeProvider=%s → paymentToken НЕ в теле create-payment, редирект на confirmationUrl',
    async (provider) => {
      (window as any).__MERFY_CONFIG__ = { shopId: 'shop1', apiUrl: 'https://gateway.test/api' };
      // Жёсткий сценарий (как в checkout-payment-provider-view): ответ ВСЁ ЖЕ несёт
      // yookassaShopId (billing не успел обновиться), да ещё и SDK ЮKassa уже
      // доступен в window (кеш/предыдущая сессия на этой вкладке). Гейт по
      // activeProvider обязан держать и это — иначе токен утёк бы в заказ.
      const fetchMock = combinedFetchMock({ yookassaEnabled: true, yookassaShopId: 'yk_leak', activeProvider: provider });
      (window as any).fetch = fetchMock;
      (window as any).YooMoneyCheckout = function YooMoneyCheckout() {
        return { tokenize: async () => ({ data: { response: { paymentToken: 'tok_leak' } } }) };
      };

      const { paymentSection, submitSection } = mountDom();

      // CheckoutPayment объявляет window.__checkoutTokenizeCard и решает вид
      // (здесь нас интересует именно поведение токенизации, не вид).
      (window as any).__merfyRoot = () => paymentSection;
      astroInlineRunners(PAYMENT_ASTRO)[0].run({ blockId: 'cp-1' });
      await flush();

      (window as any).__merfyRoot = () => submitSection;
      astroInlineRunners(SUBMIT_ASTRO)[0].run({
        buttonText: 'Оформить — {total}',
        loadingText: 'Оформляем…',
        successRedirectUrl: '/checkout/result',
        blockId: 'cs-1',
      });
      selectDelivery(SELF_PICKUP);

      const btn = submitSection.querySelector('[data-checkout-submit]') as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
      btn.click();
      await flush();

      const paymentBody = bodyOf(fetchMock, /\/create-payment$/);
      expect(paymentBody).not.toBeNull();
      expect('paymentToken' in paymentBody).toBe(false);
      expect((window as any).location.href).toBe(CONFIRMATION_URL);
    },
  );

  it('activeProvider=yookassa (контроль) → paymentToken ЕСТЬ в теле create-payment, тот же редирект', async () => {
    (window as any).__MERFY_CONFIG__ = { shopId: 'shop1', apiUrl: 'https://gateway.test/api' };
    const fetchMock = combinedFetchMock({ yookassaEnabled: true, yookassaShopId: 'yk_1', activeProvider: 'yookassa' });
    (window as any).fetch = fetchMock;
    // SDK ЮKassa — мок конструктора, как его грузит настоящий <script> (см. ensureYookassaSdk).
    (window as any).YooMoneyCheckout = function YooMoneyCheckout() {
      return { tokenize: async () => ({ data: { response: { paymentToken: 'tok_123' } } }) };
    };

    const { paymentSection, submitSection } = mountDom();

    (window as any).__merfyRoot = () => paymentSection;
    astroInlineRunners(PAYMENT_ASTRO)[0].run({ blockId: 'cp-1' });
    await flush();

    (window as any).__merfyRoot = () => submitSection;
    astroInlineRunners(SUBMIT_ASTRO)[0].run({
      buttonText: 'Оформить — {total}',
      loadingText: 'Оформляем…',
      successRedirectUrl: '/checkout/result',
      blockId: 'cs-1',
    });
    selectDelivery(SELF_PICKUP);

    const btn = submitSection.querySelector('[data-checkout-submit]') as HTMLButtonElement;
    btn.click();
    await flush();

    const paymentBody = bodyOf(fetchMock, /\/create-payment$/);
    expect(paymentBody).not.toBeNull();
    expect(paymentBody.paymentToken).toBe('tok_123');
    expect((window as any).location.href).toBe(CONFIRMATION_URL);
  });
});

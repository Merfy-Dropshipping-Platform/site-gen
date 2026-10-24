/**
 * @jest-environment jsdom
 *
 * CheckoutPayment + CheckoutSubmit вместе — сквозной сабмит: форма карты убрана,
 * покупатель выбирает способ, а данные вводит на странице платёжки.
 *
 * Инвариант, при любой платёжке магазина (yookassa, tochka, robokassa, prodamus):
 *   - `paymentToken` НЕ попадает в тело POST /create-payment (токенизации на
 *     витрине нет, SDK ЮKassa не грузится);
 *   - выбранный способ (`paymentMethod`) попадает в тело как есть;
 *   - покупатель уходит на `confirmationUrl` из ответа — платёжка сама решает,
 *     что показать (страница ЮKassa, Точки, Робокассы, Prodamus).
 * Оба инлайн-скрипта исполняются вместе, как на живой странице (мега-блок
 * CheckoutForm рендерит их друг за другом).
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

/** Смонтировать оба блока, выбрать способ, нажать «Оформить», вернуть мок fetch. */
async function submitWithMethod(
  provider: string,
  method: string,
): Promise<{ fetchMock: jest.Mock; paymentBody: any }> {
  (window as any).__MERFY_CONFIG__ = { shopId: 'shop1', apiUrl: 'https://gateway.test/api' };
  const fetchMock = combinedFetchMock({
    yookassaEnabled: provider === 'yookassa',
    yookassaShopId: provider === 'yookassa' ? 'yk_1' : null,
    activeProvider: provider,
  });
  (window as any).fetch = fetchMock;
  // Даже если на странице остался старый SDK ЮKassa (кеш/прошлая сессия), токен не берётся.
  (window as any).YooMoneyCheckout = function YooMoneyCheckout() {
    return { tokenize: async () => ({ data: { response: { paymentToken: 'tok_leak' } } }) };
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

  const radio = paymentSection.querySelector(`input[value="${method}"]`) as HTMLInputElement;
  radio.checked = true;
  radio.dispatchEvent(new Event('change'));

  const btn = submitSection.querySelector('[data-checkout-submit]') as HTMLButtonElement;
  expect(btn.disabled).toBe(false);
  btn.click();
  await flush();

  return { fetchMock, paymentBody: bodyOf(fetchMock, /\/create-payment$/) };
}

describe('CheckoutPayment + CheckoutSubmit — сквозной сабмит без формы карты', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    baseCart();
    delete (window as any).location;
    (window as any).location = { origin: 'https://shop.test', href: '' };
  });
  afterEach(cleanup);

  it.each(['yookassa', 'tochka', 'robokassa', 'prodamus'])(
    'платёжка %s → paymentToken НЕ в теле create-payment, редирект на confirmationUrl',
    async (provider) => {
      const { paymentBody } = await submitWithMethod(provider, 'bank_card');

      expect(paymentBody).not.toBeNull();
      expect('paymentToken' in paymentBody).toBe(false);
      expect(paymentBody.paymentMethod).toBe('bank_card');
      expect((window as any).location.href).toBe(CONFIRMATION_URL);
    },
  );

  it.each(['bank_card', 'sbp', 'sberbank', 'tinkoff_bank'])(
    'выбран способ «%s» → он уходит в create-payment как paymentMethod, SDK ЮKassa не грузится',
    async (method) => {
      const { paymentBody } = await submitWithMethod('yookassa', method);

      expect(paymentBody.paymentMethod).toBe(method);
      expect('paymentToken' in paymentBody).toBe(false);
      expect(document.head.querySelector('script[src^="https://yookassa.ru"]')).toBeNull();
      expect((window as any).location.href).toBe(CONFIRMATION_URL);
    },
  );
});

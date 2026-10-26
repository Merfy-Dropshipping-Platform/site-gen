/**
 * @jest-environment jsdom
 *
 * CheckoutPayment + CheckoutSubmit — пустой действующий список способов оплаты.
 *
 * billing считает `enabledMethods` = выбор магазина ∩ возможности платёжки ∩
 * подключённое в её кабинете. Пустое пересечение — не «показать всё»:
 *   - `enabledMethods: []` → способы скрыты, «Оплата сейчас недоступна»,
 *     событие `checkout:payment-unavailable`, кнопка «Оформить» выключена и
 *     клик по ней ничего не отправляет;
 *   - «нет данных» (поле отсутствует, сеть упала, не-200) → как раньше: способы
 *     видны, оплатить можно;
 *   - непустой список → прежнее поведение (скрыть лишние), блокировки нет.
 * Оба инлайн-скрипта исполняются вместе, как на живой странице.
 */
import { join } from 'path';
import { astroInlineRunners } from './helpers/astro-inline-script';

const PAYMENT_ASTRO = join(__dirname, '..', 'blocks', 'CheckoutPayment', 'CheckoutPayment.astro');
const SUBMIT_ASTRO = join(__dirname, '..', 'blocks', 'CheckoutSubmit', 'CheckoutSubmit.astro');
const UNAVAILABLE = 'Оплата сейчас недоступна';

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
      </div>
      <p data-checkout-payment-unavailable role="alert" hidden>${UNAVAILABLE}</p>
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

function flush() {
  return new Promise((r) => setTimeout(r, 10));
}

/** payment-config/public отвечает `configResponse`, остальное — успешно. */
function fetchMockFor(configResponse: () => Promise<unknown>): jest.Mock {
  return jest.fn((url: string) => {
    if (/\/payment-config\/public$/.test(url)) return configResponse();
    if (/\/checkout$/.test(url))
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: { orderId: 'o1' } }) });
    if (/\/create-payment$/.test(url))
      return Promise.resolve({ ok: true, json: async () => ({ data: { confirmationUrl: 'https://pay.test/x' } }) });
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

const okConfig = (data: Record<string, unknown>) => () =>
  Promise.resolve({ ok: true, json: async () => ({ success: true, data }) });

async function mountBoth(configResponse: () => Promise<unknown>) {
  (window as any).__MERFY_CONFIG__ = { shopId: 'shop1', apiUrl: 'https://gateway.test/api' };
  (window as any).cartStore = {
    getItems: () => [{ id: 'i1', productId: 'p1', quantity: 1, unitPriceCents: 100000 }],
    getTotal: () => 100000,
    syncToServer: jest.fn(async () => 'cart_new'),
  };
  const fetchMock = fetchMockFor(configResponse);
  (window as any).fetch = fetchMock;

  const { paymentSection, submitSection } = mountDom();
  const events: boolean[] = [];
  document.addEventListener('checkout:payment-unavailable', (e) => {
    events.push((e as CustomEvent).detail.unavailable);
  });

  (window as any).__merfyRoot = () => submitSection;
  astroInlineRunners(SUBMIT_ASTRO)[0].run({
    buttonText: 'Оформить — {total}',
    loadingText: 'Оформляем…',
    successRedirectUrl: '/checkout/result',
    blockId: 'cs-1',
  });
  (window as any).__merfyRoot = () => paymentSection;
  astroInlineRunners(PAYMENT_ASTRO)[0].run({ blockId: 'cp-1' });
  document.dispatchEvent(new CustomEvent('checkout:delivery-changed', { detail: SELF_PICKUP }));
  await flush();

  return {
    fetchMock,
    events,
    paymentSection,
    button: submitSection.querySelector('[data-checkout-submit]') as HTMLButtonElement,
    errorEl: submitSection.querySelector('[data-checkout-submit-error]') as HTMLElement,
    unavailableEl: paymentSection.querySelector('[data-checkout-payment-unavailable]') as HTMLElement,
    display: (key: string) =>
      (paymentSection.querySelector(`[data-payment-key="${key}"]`) as HTMLElement).style.display,
  };
}

describe('CheckoutPayment + CheckoutSubmit — пустой список способов', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    delete (window as any).location;
    (window as any).location = { origin: 'https://shop.test', href: '' };
  });
  afterEach(() => {
    delete (window as any).cartStore;
    delete (window as any).fetch;
    delete (window as any).__merfyRoot;
    delete (window as any).__MERFY_CONFIG__;
  });

  it('enabledMethods=[] → «Оплата сейчас недоступна», способы скрыты, оплатить нельзя', async () => {
    const t = await mountBoth(okConfig({ activeProvider: 'tochka', enabledMethods: [] }));

    expect(t.unavailableEl.hidden).toBe(false);
    expect(t.unavailableEl.textContent).toBe(UNAVAILABLE);
    expect(t.display('bank_card')).toBe('none');
    expect(t.display('sbp')).toBe('none');
    expect(t.events).toEqual([true]);
    expect(t.button.disabled).toBe(true);
    expect(t.errorEl.hidden).toBe(false);
    expect(t.errorEl.textContent).toBe(UNAVAILABLE);

    // Клик в обход disabled (devtools) — запрос на создание заказа не уходит.
    t.button.disabled = false;
    t.button.click();
    await flush();
    const posted = t.fetchMock.mock.calls.map((c) => String(c[0]));
    expect(posted.some((u) => /\/checkout$/.test(u) || /\/create-payment$/.test(u))).toBe(false);
  });

  it('enabledMethods непустой → блокировки нет, лишние скрыты, сообщения нет', async () => {
    const t = await mountBoth(okConfig({ activeProvider: 'tochka', enabledMethods: ['bank_card'] }));

    expect(t.unavailableEl.hidden).toBe(true);
    expect(t.display('bank_card')).toBe('');
    expect(t.display('sbp')).toBe('none');
    expect(t.events).toEqual([false]);
    expect(t.button.disabled).toBe(false);
    expect(t.errorEl.hidden).toBe(true);
  });

  it('поля enabledMethods нет (нет данных) → всё как раньше, оплатить можно', async () => {
    const t = await mountBoth(okConfig({ activeProvider: 'tochka' }));

    expect(t.unavailableEl.hidden).toBe(true);
    expect(t.display('bank_card')).toBe('');
    expect(t.display('sbp')).toBe('');
    expect(t.events).toEqual([]);
    expect(t.button.disabled).toBe(false);
  });

  it('сеть упала → «нет данных»: способы видны, оплатить можно, сообщения нет', async () => {
    const t = await mountBoth(() => Promise.reject(new Error('network')));

    expect(t.unavailableEl.hidden).toBe(true);
    expect(t.display('bank_card')).toBe('');
    expect(t.events).toEqual([]);
    expect(t.button.disabled).toBe(false);
    expect(t.errorEl.hidden).toBe(true);
  });

  it('ответ не 200 → «нет данных»: оплатить можно', async () => {
    const t = await mountBoth(() => Promise.resolve({ ok: false, status: 502, json: async () => ({}) }));

    expect(t.unavailableEl.hidden).toBe(true);
    expect(t.events).toEqual([]);
    expect(t.button.disabled).toBe(false);
  });
});

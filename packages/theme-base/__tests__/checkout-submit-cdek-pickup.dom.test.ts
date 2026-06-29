/**
 * @jest-environment jsdom
 *
 * CheckoutSubmit + CDEK самовывоз (ПВЗ/постамат):
 *  - guard: cdek_pickup без выбранной точки → кнопка оплаты disabled;
 *    с pickupPointCode → enabled; cdek_door точку не требует;
 *  - Step 0: при оплате уходит POST /delivery/select c pickupPointCode
 *    ДО /checkout (единственный путь, по которому код точки доезжает до
 *    orders.cdekPickupPointCode → logistic delivery_point).
 * Скрипт извлекается из .astro и исполняется в jsdom (как в promo-тесте).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ASTRO = join(__dirname, '..', 'blocks', 'CheckoutSubmit', 'CheckoutSubmit.astro');

function inlineScriptBody(src: string): string {
  const m = /<script\b[^>]*>([\s\S]*?)<\/script>/i.exec(src);
  if (!m) throw new Error('no <script> in CheckoutSubmit.astro');
  return m[1];
}

const SCRIPT = inlineScriptBody(readFileSync(ASTRO, 'utf8'));

function mountSubmitDom(): HTMLElement {
  document.body.innerHTML = `
    <section data-block="checkout-submit" data-puck-component-id="cs-1">
      <div data-checkout-submit-error role="alert" hidden></div>
      <button data-checkout-submit disabled>Оформить — —</button>
    </section>
    <div data-checkout-delivery data-selected-city-fias-id="fias-1"
         data-addr-street="Ленина" data-addr-building="1" data-addr-apartment="5"></div>
    <div data-checkout-field="email"><input value="a@b.ru" /></div>
    <div data-checkout-field="phone"><input value="+79990000000" /></div>
    <div data-checkout-field="firstName"><input value="Иван" /></div>
    <div data-checkout-field="lastName"><input value="Петров" /></div>
    <div data-checkout-field="fullName"><input value="" /></div>
    <div data-checkout-field="city"><input value="Москва" /></div>
    <div data-checkout-field="postalCode"><input value="101000" /></div>
    <div data-checkout-field="address"><input value="Ленина, 1, 5" /></div>
    <div data-checkout-field="country"><input value="Россия" /></div>`;
  return document.querySelector('[data-block="checkout-submit"]') as HTMLElement;
}

function runScript(section: HTMLElement) {
  (window as any).__merfyRoot = () => section;
  // eslint-disable-next-line no-new-func
  new Function('buttonText', 'loadingText', 'successRedirectUrl', 'blockId', SCRIPT)(
    'Оформить — {total}',
    'Оформляем…',
    '/checkout/result',
    'cs-1',
  );
}

function selectDelivery(detail: Record<string, unknown>) {
  document.dispatchEvent(new CustomEvent('checkout:delivery-changed', { detail }));
  document.dispatchEvent(
    new CustomEvent('checkout:payment-method-changed', { detail: { method: 'bank_card' } }),
  );
}

describe('CheckoutSubmit — CDEK самовывоз guard', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    (window as any).cartStore = {
      getItems: () => [{ id: 'i1', productId: 'p1', quantity: 1, unitPriceCents: 100000 }],
      getTotal: () => 100000,
      syncToServer: jest.fn(async () => 'cart_new'),
    };
    (window as any).__MERFY_CONFIG__ = { shopId: 'shop1', apiUrl: 'https://gateway.test/api' };
    (window as any).fetch = jest.fn();
  });
  afterEach(() => {
    delete (window as any).cartStore;
    delete (window as any).fetch;
    delete (window as any).__merfyRoot;
    delete (window as any).__MERFY_CONFIG__;
  });

  it('cdek_pickup без точки → disabled; с pickupPointCode → enabled', () => {
    const section = mountSubmitDom();
    runScript(section);
    const btn = section.querySelector('[data-checkout-submit]') as HTMLButtonElement;

    selectDelivery({ type: 'cdek_pickup', label: 'До пункта выдачи', costCents: 51000, tariffCode: 138 });
    expect(btn.disabled).toBe(true);

    selectDelivery({
      type: 'cdek_pickup',
      label: 'До пункта выдачи',
      costCents: 51000,
      tariffCode: 138,
      pickupPointCode: 'PVZ77',
      pickupPointAddress: 'ул. Тестовая, 1',
    });
    expect(btn.disabled).toBe(false);
  });

  it('cdek_door точку НЕ требует → enabled без кода', () => {
    const section = mountSubmitDom();
    runScript(section);
    const btn = section.querySelector('[data-checkout-submit]') as HTMLButtonElement;

    selectDelivery({ type: 'cdek_door', label: 'Курьер до двери', costCents: 79500, tariffCode: 137 });
    expect(btn.disabled).toBe(false);
  });
});

describe('CheckoutSubmit — Step 0 /delivery/select', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    (window as any).cartStore = {
      getItems: () => [{ id: 'i1', productId: 'p1', quantity: 1, unitPriceCents: 100000 }],
      getTotal: () => 100000,
      syncToServer: jest.fn(async () => 'cart_new'),
    };
    (window as any).__MERFY_CONFIG__ = { shopId: 'shop1', apiUrl: 'https://gateway.test/api' };
    (window as any).__checkoutTokenizeCard = undefined;
    delete (window as any).location;
    (window as any).location = { origin: 'https://shop.test', href: '' };
    fetchMock = jest.fn((url: string) => {
      if (/\/delivery\/select$/.test(url)) return Promise.resolve({ ok: true, json: async () => ({ data: {} }) });
      if (/\/checkout$/.test(url))
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: { orderId: 'o1' } }) });
      if (/\/create-payment$/.test(url))
        return Promise.resolve({ ok: true, json: async () => ({ data: { confirmationUrl: 'https://pay.test/x' } }) });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    (window as any).fetch = fetchMock;
  });
  afterEach(() => {
    delete (window as any).cartStore;
    delete (window as any).fetch;
    delete (window as any).__merfyRoot;
    delete (window as any).__MERFY_CONFIG__;
  });

  const urlsOf = () => fetchMock.mock.calls.map((c) => String(c[0]));

  it('для cdek_pickup шлёт POST /delivery/select c pickupPointCode ДО /checkout', async () => {
    const section = mountSubmitDom();
    runScript(section);
    selectDelivery({
      type: 'cdek_pickup',
      label: 'До пункта выдачи',
      costCents: 51000,
      tariffCode: 138,
      pickupPointCode: 'PVZ77',
      pickupPointAddress: 'ул. Тестовая, 1',
    });
    (section.querySelector('[data-checkout-submit]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 10));

    const urls = urlsOf();
    const selectIdx = urls.findIndex((u) => /\/carts\/cart_new\/delivery\/select$/.test(u));
    const checkoutIdx = urls.findIndex((u) => /\/cart\/cart_new\/checkout$/.test(u));
    expect(selectIdx).toBeGreaterThanOrEqual(0);
    expect(checkoutIdx).toBeGreaterThanOrEqual(0);
    expect(selectIdx).toBeLessThan(checkoutIdx); // select ДО checkout

    const body = JSON.parse(fetchMock.mock.calls[selectIdx][1].body);
    expect(body.pickupPointCode).toBe('PVZ77');
    expect(body.type).toBe('cdek_pickup');
    expect(body.tariffCode).toBe(138);
    expect(body.address.house).toBe('1'); // building → house
  });

  it('для cdek_door НЕ шлёт /delivery/select', async () => {
    const section = mountSubmitDom();
    runScript(section);
    selectDelivery({ type: 'cdek_door', label: 'Курьер', costCents: 79500, tariffCode: 137 });
    (section.querySelector('[data-checkout-submit]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 10));
    expect(urlsOf().some((u) => /\/delivery\/select$/.test(u))).toBe(false);
  });
});

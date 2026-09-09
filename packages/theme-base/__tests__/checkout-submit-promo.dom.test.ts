/**
 * @jest-environment jsdom
 *
 * Integration test for the CheckoutSubmit inline script: re-applies the promo
 * (POST /promo) after syncToServer and BEFORE /checkout, and aborts checkout if
 * the promo is no longer valid. Script body is extracted from the .astro source
 * and executed in jsdom with `define:vars` injected (preview-nav-agent precedent).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ASTRO = join(__dirname, '..', 'blocks', 'CheckoutSubmit', 'CheckoutSubmit.astro');

function inlineScriptBody(src: string): string {
  const m = /<script\b[^>]*>([\s\S]*?)<\/script>/i.exec(src);
  if (!m) throw new Error('no <script> in CheckoutSubmit.astro');
  return m[1];
}

const SRC = readFileSync(ASTRO, 'utf8');
const SCRIPT = inlineScriptBody(SRC);

/** Full checkout DOM: submit section + all cross-block fields the script reads. */
function mountSubmitDom(): HTMLElement {
  document.body.innerHTML = `
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
  return document.querySelector('[data-block="checkout-submit"]') as HTMLElement;
}

function runScript(section: HTMLElement) {
  (window as any).__merfyRoot = () => section;
  const vars = {
    buttonText: 'Оформить — {total}',
    loadingText: 'Оформляем…',
    successRedirectUrl: '/checkout/result',
    blockId: 'cs-1',
  };
  // eslint-disable-next-line no-new-func
  new Function(
    'buttonText',
    'loadingText',
    'successRedirectUrl',
    'blockId',
    SCRIPT,
  )(vars.buttonText, vars.loadingText, vars.successRedirectUrl, vars.blockId);
}

/** Make the submit button enabled by satisfying canSubmit(), then fire delivery/payment. */
function makeSubmittable(section: HTMLElement) {
  document.dispatchEvent(
    new CustomEvent('checkout:delivery-changed', {
      detail: { type: 'cdek_pvz', label: 'CDEK', costCents: 30000, tariffCode: 1 },
    }),
  );
  document.dispatchEvent(
    new CustomEvent('checkout:payment-method-changed', { detail: { method: 'bank_card' } }),
  );
}

describe('CheckoutSubmit inline promo re-apply', () => {
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
    // jsdom: stub navigation so window.location.href assignment doesn't throw.
    delete (window as any).location;
    (window as any).location = { origin: 'https://shop.test', href: '' };

    fetchMock = jest.fn();
    (window as any).fetch = fetchMock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (window as any).cartStore;
    delete (window as any).fetch;
    delete (window as any).__merfyRoot;
    delete (window as any).__MERFY_CONFIG__;
  });

  function urlsOf(): string[] {
    return fetchMock.mock.calls.map((c) => String(c[0]));
  }

  it('re-applies promo (POST /promo with {promoCode}) after syncToServer, BEFORE /checkout', async () => {
    sessionStorage.setItem('merfy:promoCode', 'SALE10');
    fetchMock.mockImplementation((url: string) => {
      if (/\/promo$/.test(url)) return Promise.resolve({ ok: true, json: async () => ({ data: {} }) });
      if (/\/customer$/.test(url) || /\/address$/.test(url))
        return Promise.resolve({ ok: true, json: async () => ({}) });
      if (/\/checkout$/.test(url))
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: { orderId: 'o1' } }) });
      if (/\/create-payment$/.test(url))
        return Promise.resolve({ ok: true, json: async () => ({ data: { confirmationUrl: 'https://pay.test/x' } }) });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    const section = mountSubmitDom();
    runScript(section);
    makeSubmittable(section);
    (section.querySelector('[data-checkout-submit]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 10));

    const urls = urlsOf();
    const promoIdx = urls.findIndex((u) => /\/cart\/cart_new\/promo$/.test(u));
    const checkoutIdx = urls.findIndex((u) => /\/cart\/cart_new\/checkout$/.test(u));
    expect(promoIdx).toBeGreaterThanOrEqual(0);
    expect(checkoutIdx).toBeGreaterThanOrEqual(0);
    expect(promoIdx).toBeLessThan(checkoutIdx); // promo BEFORE checkout

    const promoOpts = fetchMock.mock.calls[promoIdx][1];
    expect(promoOpts.method).toBe('POST');
    expect(JSON.parse(promoOpts.body)).toEqual({ promoCode: 'SALE10' });

    // success → promoCode cleared, navigated to confirmation
    expect(sessionStorage.getItem('merfy:promoCode')).toBeNull();
    expect((window as any).location.href).toBe('https://pay.test/x');
  });

  it('ABORTS checkout when the promo is no longer valid (no /checkout call, error shown)', async () => {
    sessionStorage.setItem('merfy:promoCode', 'EXPIRED');
    fetchMock.mockImplementation((url: string) => {
      if (/\/promo$/.test(url))
        return Promise.resolve({ ok: false, json: async () => ({ message: 'Промокод истёк' }) });
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: { orderId: 'o1' } }) });
    });

    const section = mountSubmitDom();
    runScript(section);
    makeSubmittable(section);
    (section.querySelector('[data-checkout-submit]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 10));

    const urls = urlsOf();
    expect(urls.some((u) => /\/checkout$/.test(u))).toBe(false); // aborted
    expect(urls.some((u) => /\/create-payment$/.test(u))).toBe(false);
    const err = section.querySelector('[data-checkout-submit-error]') as HTMLElement;
    expect(err.hidden).toBe(false);
    expect(err.textContent).toBe('Промокод истёк');
    expect((window as any).location.href).toBe(''); // no navigation
  });

  it('skips promo POST entirely when no merfy:promoCode is set', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (/\/checkout$/.test(url))
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: { orderId: 'o1' } }) });
      if (/\/create-payment$/.test(url))
        return Promise.resolve({ ok: true, json: async () => ({ data: { confirmationUrl: 'https://pay.test/y' } }) });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    const section = mountSubmitDom();
    runScript(section);
    makeSubmittable(section);
    (section.querySelector('[data-checkout-submit]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 10));

    expect(urlsOf().some((u) => /\/promo$/.test(u))).toBe(false);
  });
});

describe('CheckoutSubmit total reflects discount', () => {
  // Drives the button label through the public event the OrderSummary emits.
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

  // toLocaleString('ru-RU') uses U+202F narrow no-break space — normalise it.
  const norm = (s: string | null) => (s || '').replace(/\s/g, ' ');

  it('button label shows total minus discount after checkout:discount-applied', () => {
    const section = mountSubmitDom();
    runScript(section);
    const btn = section.querySelector('[data-checkout-submit]') as HTMLButtonElement;
    // before: subtotal 1000₽ (100000 cents), no discount, no delivery
    expect(norm(btn.textContent)).toContain('1 000₽');
    document.dispatchEvent(
      new CustomEvent('checkout:discount-applied', { detail: { code: 'X', discountCents: 20000 } }),
    );
    // after: 1000 − 200 = 800₽
    expect(norm(btn.textContent)).toContain('800₽');
  });
});

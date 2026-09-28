/**
 * @jest-environment jsdom
 */
/**
 * Владелец 28.09: при необязательной регистрации клиента (requireCustomerAuth
 * !== true) телефона на чекауте нет — почта остаётся. Телефон спрашивается и
 * обязателен ТОЛЬКО когда requireCustomerAuth===true И contactMethod!=='email'.
 * Во всех остальных случаях (регистрация необязательна ИЛИ contactMethod='email')
 * работает режим «только почта»: телефон скрыт/не отправляется/не проверяется.
 *
 * Прогон — настоящие inline-скрипты блоков `theme-base/CheckoutContactForm`
 * (видимость поля) и `theme-base/CheckoutSubmit` (гейт кнопки + payload) в
 * jsdom, как в checkout-undeliverable-product.spec.ts. Лежит здесь, а не в
 * `packages/theme-base/__tests__` (более детальные dom-тесты там же): тесты
 * оттуда CI не запускает (см. reference_ci_skips_theme_base_tests).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const CONTACT_ASTRO = join(
  __dirname,
  '..',
  '..',
  '..',
  'packages/theme-base/blocks/CheckoutContactForm/CheckoutContactForm.astro',
);
const SUBMIT_ASTRO = join(
  __dirname,
  '..',
  '..',
  '..',
  'packages/theme-base/blocks/CheckoutSubmit/CheckoutSubmit.astro',
);

/** Тело <script>, содержащего маркер (в CheckoutContactForm.astro их два). */
function scriptBodyWith(src: string, marker: string): string {
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[1].includes(marker)) return m[1];
  }
  throw new Error(`no <script> with marker "${marker}"`);
}

const CONTACT_SCRIPT = scriptBodyWith(
  readFileSync(CONTACT_ASTRO, 'utf8'),
  'initCheckoutContactConfig',
);

function inlineScriptBody(src: string): string {
  const m = /<script\b[^>]*>([\s\S]*?)<\/script>/i.exec(src);
  if (!m) throw new Error('no <script> in CheckoutSubmit.astro');
  return m[1];
}
const SUBMIT_SCRIPT = inlineScriptBody(readFileSync(SUBMIT_ASTRO, 'utf8'));

const FIELD_FULL = 'md:col-span-2';
const TOKEN_KEY = 'merfy_customer_token';

// ── CheckoutContactForm: видимость поля телефона ────────────────────────────
describe('CheckoutContactForm — requireCustomerAuth × contactMethod (владелец 28.09)', () => {
  function mountContactDom(): HTMLElement {
    document.body.innerHTML = `
      <section data-checkout-contact data-puck-component-id="ccf-1">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          <div class="field" data-checkout-field="email">
            <input id="checkout-email" name="email" type="email" />
          </div>
          <div class="field" data-checkout-field="phone" data-format="ru">
            <input id="checkout-phone" name="phone" type="tel" data-checkout-phone />
          </div>
        </div>
      </section>`;
    return document.querySelector('[data-checkout-contact]') as HTMLElement;
  }

  function runContactScript(section: HTMLElement) {
    (window as any).__merfyRoot = () => section;
    // eslint-disable-next-line no-new-func
    new Function('blockId', 'fieldFullClass', CONTACT_SCRIPT)('ccf-1', FIELD_FULL);
  }

  afterEach(() => {
    delete (window as any).__merfyRoot;
    delete (window as any).__MERFY_CONFIG__;
  });

  it('дефолт (нет checkout-конфига) → email-only: телефон скрыт, email растянут', () => {
    (window as any).__MERFY_CONFIG__ = {};
    const section = mountContactDom();
    runContactScript(section);
    const phone = section.querySelector('[data-checkout-field="phone"]') as HTMLElement;
    const email = section.querySelector('[data-checkout-field="email"]') as HTMLElement;
    expect(phone.hidden).toBe(true);
    expect(email.classList.contains(FIELD_FULL)).toBe(true);
  });

  it("requireCustomerAuth=true + contactMethod='email-phone' → оба поля видны", () => {
    (window as any).__MERFY_CONFIG__ = { checkout: { requireCustomerAuth: true, contactMethod: 'email-phone' } };
    const section = mountContactDom();
    runContactScript(section);
    const phone = section.querySelector('[data-checkout-field="phone"]') as HTMLElement;
    const email = section.querySelector('[data-checkout-field="email"]') as HTMLElement;
    expect(phone.hidden).toBe(false);
    expect(email.classList.contains(FIELD_FULL)).toBe(false);
  });

  it("requireCustomerAuth=true + contactMethod='email' → всё равно email-only", () => {
    (window as any).__MERFY_CONFIG__ = { checkout: { requireCustomerAuth: true, contactMethod: 'email' } };
    const section = mountContactDom();
    runContactScript(section);
    const phone = section.querySelector('[data-checkout-field="phone"]') as HTMLElement;
    expect(phone.hidden).toBe(true);
  });

  it("requireCustomerAuth=false + contactMethod='email-phone' → всё равно email-only (регистрация необязательна)", () => {
    (window as any).__MERFY_CONFIG__ = { checkout: { requireCustomerAuth: false, contactMethod: 'email-phone' } };
    const section = mountContactDom();
    runContactScript(section);
    const phone = section.querySelector('[data-checkout-field="phone"]') as HTMLElement;
    expect(phone.hidden).toBe(true);
  });
});

// ── CheckoutSubmit: гейт кнопки + payload ────────────────────────────────────
describe('CheckoutSubmit — requireCustomerAuth × contactMethod, phone-гейт (владелец 28.09)', () => {
  function mountSubmitDom(phone: string): HTMLElement {
    document.body.innerHTML = `
      <section data-block="checkout-submit" data-puck-component-id="cs-1">
        <div data-checkout-submit-error role="alert" hidden></div>
        <button data-checkout-submit disabled>Оформить — —</button>
      </section>
      <div data-checkout-delivery data-selected-city-fias-id="fias-1"></div>
      <div data-checkout-field="email"><input value="a@b.ru" /></div>
      <div data-checkout-field="phone"><input value="${phone}" /></div>
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

  function runSubmitScript(section: HTMLElement) {
    (window as any).__merfyRoot = () => section;
    // eslint-disable-next-line no-new-func
    new Function('buttonText', 'loadingText', 'successRedirectUrl', 'blockId', SUBMIT_SCRIPT)(
      'Оформить — {total}',
      'Оформляем…',
      '/checkout/result',
      'cs-1',
    );
  }

  function selectDelivery(detail: Record<string, unknown>) {
    document.dispatchEvent(new CustomEvent('checkout:delivery-changed', { detail }));
  }

  const SELF_PICKUP = { type: 'self_pickup', label: 'Самовывоз', costCents: 0, tariffCode: null };

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    (window as any).cartStore = {
      getItems: () => [{ id: 'i1', productId: 'p1', quantity: 1, unitPriceCents: 100000 }],
      getTotal: () => 100000,
      syncToServer: jest.fn(async () => 'cart_new'),
    };
    (window as any).fetch = jest.fn();
    delete (window as any).location;
    (window as any).location = { origin: 'https://shop.test', href: '' };
  });

  afterEach(() => {
    delete (window as any).cartStore;
    delete (window as any).fetch;
    delete (window as any).__merfyRoot;
    delete (window as any).__MERFY_CONFIG__;
  });

  it('дефолт (нет checkout-конфига) → кнопка ENABLED без телефона (регистрация необязательна ⇒ телефона нет)', () => {
    (window as any).__MERFY_CONFIG__ = { shopId: 'shop1', apiUrl: 'https://gateway.test/api' };
    const section = mountSubmitDom('');
    runSubmitScript(section);
    const btn = section.querySelector('[data-checkout-submit]') as HTMLButtonElement;
    selectDelivery(SELF_PICKUP);
    expect(btn.disabled).toBe(false);
  });

  it("requireCustomerAuth=true + contactMethod='email-phone' + токен есть, нет phone → кнопка DISABLED", () => {
    localStorage.setItem(TOKEN_KEY, 'tok_test'); // изолируем от отдельного auth-гейта (нет токена)
    (window as any).__MERFY_CONFIG__ = {
      shopId: 'shop1',
      apiUrl: 'https://gateway.test/api',
      checkout: { requireCustomerAuth: true, contactMethod: 'email-phone' },
    };
    const section = mountSubmitDom('');
    runSubmitScript(section);
    const btn = section.querySelector('[data-checkout-submit]') as HTMLButtonElement;
    selectDelivery(SELF_PICKUP);
    expect(btn.disabled).toBe(true);
  });

  it("requireCustomerAuth=true + contactMethod='email' + токен есть, нет phone → кнопка ENABLED (email-only даже при обязательной регистрации)", () => {
    localStorage.setItem(TOKEN_KEY, 'tok_test');
    (window as any).__MERFY_CONFIG__ = {
      shopId: 'shop1',
      apiUrl: 'https://gateway.test/api',
      checkout: { requireCustomerAuth: true, contactMethod: 'email' },
    };
    const section = mountSubmitDom('');
    runSubmitScript(section);
    const btn = section.querySelector('[data-checkout-submit]') as HTMLButtonElement;
    selectDelivery(SELF_PICKUP);
    expect(btn.disabled).toBe(false);
  });

  it('дефолт → phone НЕ уходит в PATCH /customer и metadata.contactPhone (даже если поле заполнено)', async () => {
    (window as any).__MERFY_CONFIG__ = { shopId: 'shop1', apiUrl: 'https://gateway.test/api' };
    const fetchMock = jest.fn((url: string) => {
      if (/\/customer$/.test(url)) return Promise.resolve({ ok: true, json: async () => ({}) });
      if (/\/checkout$/.test(url))
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: { orderId: 'o1' } }) });
      if (/\/create-payment$/.test(url))
        return Promise.resolve({ ok: true, json: async () => ({ data: { confirmationUrl: 'https://pay.test/x' } }) });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    (window as any).fetch = fetchMock;
    const section = mountSubmitDom('+79990000000');
    runSubmitScript(section);
    selectDelivery(SELF_PICKUP);
    (section.querySelector('[data-checkout-submit]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 10));

    const call = fetchMock.mock.calls.find((c) => /\/customer$/.test(String(c[0])));
    const customer = call ? JSON.parse((call[1] as any).body) : null;
    expect(customer).not.toBeNull();
    expect('phone' in customer).toBe(false);

    const checkoutCall = fetchMock.mock.calls.find((c) => /\/checkout$/.test(String(c[0])));
    const checkoutBody = checkoutCall ? JSON.parse((checkoutCall[1] as any).body) : null;
    expect(checkoutBody).not.toBeNull();
    expect('contactPhone' in checkoutBody.metadata).toBe(false);
  });
});

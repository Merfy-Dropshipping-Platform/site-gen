/**
 * @jest-environment jsdom
 *
 * CheckoutSubmit — Блок 1 «Обязательная регистрация» (requireCustomerAuth):
 * клиентский backstop-гейт (canSubmit + click) и проброс Bearer покупателя.
 *
 * Контракт:
 *   window.__MERFY_CONFIG__.checkout.requireCustomerAuth === true → гость (нет
 *   'merfy_customer_token' в localStorage) не может оформить: кнопка disabled,
 *   показывается подсказка про вход по ссылке/коду. С токеном — проходит, а к
 *   fetch /checkout и /create-payment добавляется заголовок Authorization: Bearer.
 *   Флаг fail-open: false/undefined = текущее поведение (гость оформляет).
 *
 * Скрипт извлекается из .astro и исполняется в jsdom (как в config/promo/cdek-тестах).
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
const TOKEN_KEY = 'merfy_customer_token';

type Fields = Partial<{
  email: string; phone: string; firstName: string; lastName: string; fullName: string;
  city: string; postalCode: string; street: string; building: string; apartment: string; country: string;
}>;

function mountSubmitDom(overrides: Fields = {}): HTMLElement {
  const v = {
    email: 'a@b.ru', phone: '+79990000000',
    firstName: 'Иван', lastName: 'Петров', fullName: '',
    city: 'Москва', postalCode: '101000', street: 'Ленина',
    building: '1', apartment: '5', country: 'Россия',
    ...overrides,
  };
  document.body.innerHTML = `
    <section data-block="checkout-submit" data-puck-component-id="cs-1">
      <div data-checkout-submit-error role="alert" hidden></div>
      <button data-checkout-submit disabled>Оформить — —</button>
    </section>
    <div data-checkout-delivery data-selected-city-fias-id="fias-1"></div>
    <div data-checkout-field="email"><input value="${v.email}" /></div>
    <div data-checkout-field="phone"><input value="${v.phone}" /></div>
    <div data-checkout-field="firstName"><input value="${v.firstName}" /></div>
    <div data-checkout-field="lastName"><input value="${v.lastName}" /></div>
    <div data-checkout-field="fullName"><input value="${v.fullName}" /></div>
    <div data-checkout-field="city"><input value="${v.city}" /></div>
    <div data-checkout-field="postalCode"><input value="${v.postalCode}" /></div>
    <div data-checkout-field="street"><input value="${v.street}" /></div>
    <div data-checkout-field="building"><input value="${v.building}" /></div>
    <div data-checkout-field="apartment"><input value="${v.apartment}" /></div>
    <div data-checkout-field="country"><input value="${v.country}" /></div>`;
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

function setConfig(checkout?: Record<string, unknown>) {
  (window as any).__MERFY_CONFIG__ = { shopId: 'shop1', apiUrl: 'https://gateway.test/api', checkout };
}

function selectDelivery(detail: Record<string, unknown>) {
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

function cleanup() {
  delete (window as any).cartStore;
  delete (window as any).fetch;
  delete (window as any).__merfyRoot;
  delete (window as any).__MERFY_CONFIG__;
  delete (window as any).__checkoutTokenizeCard;
}

/** Fetch mock covering the whole checkout chain; records calls for assertions. */
function chainFetchMock(): jest.Mock {
  return jest.fn((url: string) => {
    if (/\/customer$/.test(url)) return Promise.resolve({ ok: true, json: async () => ({}) });
    if (/\/address$/.test(url)) return Promise.resolve({ ok: true, json: async () => ({}) });
    if (/\/delivery\/select$/.test(url)) return Promise.resolve({ ok: true, json: async () => ({ data: {} }) });
    if (/\/checkout$/.test(url))
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: { orderId: 'o1' } }) });
    if (/\/create-payment$/.test(url))
      return Promise.resolve({ ok: true, json: async () => ({ data: { confirmationUrl: 'https://pay.test/x' } }) });
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

const headersOf = (mock: jest.Mock, re: RegExp): Record<string, string> | null => {
  const call = mock.mock.calls.find((c) => re.test(String(c[0])));
  return call ? ((call[1] as any).headers as Record<string, string>) : null;
};

const errorEl = (section: HTMLElement) =>
  section.querySelector('[data-checkout-submit-error]') as HTMLElement;
const btnOf = (section: HTMLElement) =>
  section.querySelector('[data-checkout-submit]') as HTMLButtonElement;

// ── canSubmit-гейт: флаг + токен ───────────────────────────────────────────────
describe('CheckoutSubmit — requireCustomerAuth gate (canSubmit)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    baseCart();
    (window as any).fetch = jest.fn();
    delete (window as any).location;
    (window as any).location = { origin: 'https://shop.test', href: '' };
  });
  afterEach(cleanup);

  it('флаг ON + нет токена → кнопка DISABLED (гейт)', () => {
    setConfig({ requireCustomerAuth: true });
    const section = mountSubmitDom();
    runScript(section);
    selectDelivery(SELF_PICKUP); // физ-адрес заполнен, доставка выбрана — блокирует только auth
    expect(btnOf(section).disabled).toBe(true);
  });

  it('флаг ON + есть токен → кнопка ENABLED (проходит)', () => {
    localStorage.setItem(TOKEN_KEY, 'tok_abc');
    setConfig({ requireCustomerAuth: true });
    const section = mountSubmitDom();
    runScript(section);
    selectDelivery(SELF_PICKUP);
    expect(btnOf(section).disabled).toBe(false);
  });

  it('флаг OFF (false) + нет токена → кнопка ENABLED (fail-open, регресс)', () => {
    setConfig({ requireCustomerAuth: false });
    const section = mountSubmitDom();
    runScript(section);
    selectDelivery(SELF_PICKUP);
    expect(btnOf(section).disabled).toBe(false);
  });

  it('флаг отсутствует (undefined checkout) + нет токена → кнопка ENABLED (дефолт fail-open)', () => {
    setConfig(undefined);
    const section = mountSubmitDom();
    runScript(section);
    selectDelivery(SELF_PICKUP);
    expect(btnOf(section).disabled).toBe(false);
  });

  it('пустой токен-ключ (empty string) трактуется как гость → DISABLED', () => {
    localStorage.setItem(TOKEN_KEY, ''); // persistentAtom кодирует null как ''
    setConfig({ requireCustomerAuth: true });
    const section = mountSubmitDom();
    runScript(section);
    selectDelivery(SELF_PICKUP);
    expect(btnOf(section).disabled).toBe(true);
  });

  it('применяется по событию checkout:config-ready (флаг прилетает после init)', () => {
    setConfig(undefined); // старт без флага → enabled
    const section = mountSubmitDom();
    runScript(section);
    selectDelivery(SELF_PICKUP);
    expect(btnOf(section).disabled).toBe(false);

    (window as any).__MERFY_CONFIG__.checkout = { requireCustomerAuth: true };
    document.dispatchEvent(new CustomEvent('checkout:config-ready'));
    expect(btnOf(section).disabled).toBe(true); // событие пере-оценило гейт (нет токена)
  });
});

// ── Подсказка про вход ─────────────────────────────────────────────────────────
describe('CheckoutSubmit — requireCustomerAuth hint', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    baseCart();
    (window as any).fetch = jest.fn();
    delete (window as any).location;
    (window as any).location = { origin: 'https://shop.test', href: '' };
  });
  afterEach(cleanup);

  it('флаг ON + нет токена → показана подсказка про вход по ссылке/коду', () => {
    setConfig({ requireCustomerAuth: true });
    const section = mountSubmitDom();
    runScript(section);
    const err = errorEl(section);
    expect(err.hidden).toBe(false);
    expect(err.textContent).toMatch(/Войдите/);
    expect(err.textContent).toMatch(/ссылке или коду/);
    expect(err.textContent).not.toMatch(/парол/i); // копирайт про вход, НЕ про пароль
  });

  it('флаг ON + есть токен → подсказки нет (errorEl скрыт)', () => {
    localStorage.setItem(TOKEN_KEY, 'tok_abc');
    setConfig({ requireCustomerAuth: true });
    const section = mountSubmitDom();
    runScript(section);
    expect(errorEl(section).hidden).toBe(true);
  });

  it('флаг OFF → подсказки нет', () => {
    setConfig({ requireCustomerAuth: false });
    const section = mountSubmitDom();
    runScript(section);
    expect(errorEl(section).hidden).toBe(true);
  });
});

// ── Bearer-заголовок на checkout + create-payment ──────────────────────────────
describe('CheckoutSubmit — Bearer forwarding', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    baseCart();
    (window as any).fetch = jest.fn();
    delete (window as any).location;
    (window as any).location = { origin: 'https://shop.test', href: '' };
  });
  afterEach(cleanup);

  it('есть токен → Authorization: Bearer на /checkout И /create-payment', async () => {
    localStorage.setItem(TOKEN_KEY, 'tok_abc');
    setConfig({ requireCustomerAuth: true });
    const fetchMock = chainFetchMock();
    (window as any).fetch = fetchMock;
    const section = mountSubmitDom();
    runScript(section);
    selectDelivery(SELF_PICKUP);
    btnOf(section).click();
    await new Promise((r) => setTimeout(r, 10));

    expect(headersOf(fetchMock, /\/checkout$/)!.Authorization).toBe('Bearer tok_abc');
    expect(headersOf(fetchMock, /\/create-payment$/)!.Authorization).toBe('Bearer tok_abc');
  });

  it('нет токена (флаг OFF, гость) → Authorization ОТСУТСТВУЕТ на /checkout', async () => {
    setConfig({ requireCustomerAuth: false });
    const fetchMock = chainFetchMock();
    (window as any).fetch = fetchMock;
    const section = mountSubmitDom();
    runScript(section);
    selectDelivery(SELF_PICKUP);
    btnOf(section).click();
    await new Promise((r) => setTimeout(r, 10));

    const h = headersOf(fetchMock, /\/checkout$/)!;
    expect('Authorization' in h).toBe(false);
  });

  it('Bearer НЕ прикрепляется к промежуточным PATCH /customer и /address', async () => {
    localStorage.setItem(TOKEN_KEY, 'tok_abc');
    setConfig({ requireCustomerAuth: true });
    const fetchMock = chainFetchMock();
    (window as any).fetch = fetchMock;
    const section = mountSubmitDom();
    runScript(section);
    selectDelivery(SELF_PICKUP);
    btnOf(section).click();
    await new Promise((r) => setTimeout(r, 10));

    expect('Authorization' in headersOf(fetchMock, /\/customer$/)!).toBe(false);
    expect('Authorization' in headersOf(fetchMock, /\/address$/)!).toBe(false);
  });
});

// ── Серверный 403 (customer_auth_required) разворачивает на /login ──────────────
describe('CheckoutSubmit — 403 from server bounces to /login', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    baseCart();
    delete (window as any).location;
    (window as any).location = { origin: 'https://shop.test', href: '' };
  });
  afterEach(cleanup);

  it('checkout → 403 → location.href = /login?redirect=%2Fcheckout, оплата НЕ создаётся', async () => {
    // Токен есть (гейты пройдены), но сервер всё равно реджектит 403 — например
    // токен протух между Gate B и запросом. Проверяем разворот без create-payment.
    localStorage.setItem(TOKEN_KEY, 'tok_stale');
    setConfig({ requireCustomerAuth: true });
    const fetchMock = jest.fn((url: string) => {
      if (/\/checkout$/.test(url))
        return Promise.resolve({ ok: false, status: 403, json: async () => ({ message: 'Войдите', code: 'customer_auth_required' }) });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    (window as any).fetch = fetchMock;
    const section = mountSubmitDom();
    runScript(section);
    selectDelivery(SELF_PICKUP);
    btnOf(section).click();
    await new Promise((r) => setTimeout(r, 10));

    expect((window as any).location.href).toBe('/login?redirect=%2Fcheckout');
    expect(fetchMock.mock.calls.some((c) => /\/create-payment$/.test(String(c[0])))).toBe(false);
  });
});

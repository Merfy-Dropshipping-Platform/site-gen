/**
 * @jest-environment jsdom
 *
 * CheckoutSubmit — гейт сабмита + payload под настройки чекаута
 * (window.__MERFY_CONFIG__.checkout):
 *   contactMethod:      'email-phone' (дефолт) | 'email'
 *   customerNameMode:   'name-surname' (дефолт) | 'surname' | 'name'
 *   addressRequired:    true (дефолт) | false
 *
 * Покрывает:
 *  - contactMethod='email' → кнопка enabled без phone + phone НЕ в теле PATCH
 *    /customer + contactPhone опущен в metadata;
 *  - addressRequired=false → кнопка enabled без city/street + нет PATCH /address
 *    и /delivery/select + metadata.deliveryMethod = {type:'none',costCents:0}
 *    без deliveryAddress;
 *  - customerNameMode → корректный `name` в PATCH /customer и metadata.customerName;
 *  - дефолты (нет checkout-конфига) = текущее поведение (регресс);
 *  - применение по событию checkout:config-ready.
 * Скрипт извлекается из .astro и исполняется в jsdom (как в promo/cdek-тестах).
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

/**
 * fullName-раскладка (CheckoutDeliveryForm splitFirstLast:false): рендерится ОДНО
 * поле fullName — split-полей firstName/lastName в DOM НЕТ вовсе. Проверяет FIX 1
 * (fullName-fallback гейта имени).
 */
function mountSubmitDomFullNameOnly(overrides: Fields = {}): HTMLElement {
  const v = {
    email: 'a@b.ru', phone: '+79990000000', fullName: 'Иван Петров',
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

const bodyOf = (mock: jest.Mock, re: RegExp) => {
  const call = mock.mock.calls.find((c) => re.test(String(c[0])));
  return call ? JSON.parse((call[1] as any).body) : null;
};

// ── contactMethod ─────────────────────────────────────────────────────────────
describe('CheckoutSubmit — contactMethod gate + payload', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    baseCart();
    (window as any).fetch = jest.fn();
    delete (window as any).location;
    (window as any).location = { origin: 'https://shop.test', href: '' };
  });
  afterEach(cleanup);

  it("contactMethod='email' → кнопка enabled без phone", () => {
    setConfig({ contactMethod: 'email' });
    const section = mountSubmitDom({ phone: '' });
    runScript(section);
    const btn = section.querySelector('[data-checkout-submit]') as HTMLButtonElement;
    selectDelivery(SELF_PICKUP); // physical addr default true → нужен метод + city/street (заполнены)
    expect(btn.disabled).toBe(false);
  });

  it('дефолт (нет конфига) → phone обязателен (регресс: disabled без phone)', () => {
    setConfig(undefined);
    const section = mountSubmitDom({ phone: '' });
    runScript(section);
    const btn = section.querySelector('[data-checkout-submit]') as HTMLButtonElement;
    selectDelivery(SELF_PICKUP);
    expect(btn.disabled).toBe(true);
  });

  it("contactMethod='email' → phone НЕ в теле PATCH /customer, contactPhone опущен в metadata", async () => {
    setConfig({ contactMethod: 'email' });
    const fetchMock = chainFetchMock();
    (window as any).fetch = fetchMock;
    const section = mountSubmitDom({ phone: '' });
    runScript(section);
    selectDelivery(SELF_PICKUP);
    (section.querySelector('[data-checkout-submit]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 10));

    const customer = bodyOf(fetchMock, /\/customer$/);
    expect(customer).not.toBeNull();
    expect('phone' in customer).toBe(false);
    expect(customer.email).toBe('a@b.ru');

    const checkout = bodyOf(fetchMock, /\/checkout$/);
    expect(checkout.metadata.contactEmail).toBe('a@b.ru');
    expect('contactPhone' in checkout.metadata).toBe(false);
  });

  it("FIX 2: contactMethod='email' + НЕПУСТОЙ phone в поле → contactPhone всё равно ОТСУТСТВУЕТ", async () => {
    // Edge: телефон заполнен вручную (медленный fetch конфига / автозаполнение), но
    // магазин email-only. contactPhone гейтится ПО НАСТРОЙКЕ, а не по значению поля —
    // иначе телефон утёк бы в metadata заказа email-only магазина.
    setConfig({ contactMethod: 'email' });
    const fetchMock = chainFetchMock();
    (window as any).fetch = fetchMock;
    const section = mountSubmitDom({ phone: '+79991234567' });
    runScript(section);
    selectDelivery(SELF_PICKUP);
    (section.querySelector('[data-checkout-submit]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 10));

    const customer = bodyOf(fetchMock, /\/customer$/);
    expect('phone' in customer).toBe(false); // PATCH /customer тоже без phone
    const checkout = bodyOf(fetchMock, /\/checkout$/);
    expect('contactPhone' in checkout.metadata).toBe(false);
  });

  it("дефолт → phone присутствует в PATCH /customer и metadata (регресс)", async () => {
    setConfig(undefined);
    const fetchMock = chainFetchMock();
    (window as any).fetch = fetchMock;
    const section = mountSubmitDom();
    runScript(section);
    selectDelivery(SELF_PICKUP);
    (section.querySelector('[data-checkout-submit]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 10));

    const customer = bodyOf(fetchMock, /\/customer$/);
    expect(customer.phone).toBe('+79990000000');
    const checkout = bodyOf(fetchMock, /\/checkout$/);
    expect(checkout.metadata.contactPhone).toBe('+79990000000');
  });
});

// ── addressRequired ───────────────────────────────────────────────────────────
describe('CheckoutSubmit — addressRequired gate + payload', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    baseCart();
    (window as any).fetch = jest.fn();
    delete (window as any).location;
    (window as any).location = { origin: 'https://shop.test', href: '' };
  });
  afterEach(cleanup);

  it('addressRequired=false → кнопка enabled без city/street и без выбора доставки', () => {
    setConfig({ addressRequired: false });
    const section = mountSubmitDom({ city: '', street: '', building: '' });
    runScript(section);
    const btn = section.querySelector('[data-checkout-submit]') as HTMLButtonElement;
    // ни delivery-changed, ни адреса — только email+имя+payment(bank_card по умолчанию)
    expect(btn.disabled).toBe(false);
  });

  it('дефолт + курьер (cdek_door) → city/street обязательны (регресс: disabled без адреса)', () => {
    // M16: адрес требуется только для курьерских типов. Регресс-гейт «нет адреса →
    // disabled» проверяем на cdek_door (для self_pickup адрес теперь не нужен — см.
    // отдельный M16-suite). building заполнен, чтобы изолировать проверку city/street.
    setConfig(undefined);
    const section = mountSubmitDom({ city: '', street: '' });
    runScript(section);
    const btn = section.querySelector('[data-checkout-submit]') as HTMLButtonElement;
    selectDelivery({ type: 'cdek_door', label: 'CDEK курьер', costCents: 40000, tariffCode: 137 });
    expect(btn.disabled).toBe(true);
  });

  it('addressRequired=false → нет PATCH /address и /delivery/select; metadata.deliveryMethod none, без deliveryAddress', async () => {
    setConfig({ addressRequired: false });
    const fetchMock = chainFetchMock();
    (window as any).fetch = fetchMock;
    // адрес заполнен намеренно — доказываем, что при addressRequired=false он НЕ уходит
    const section = mountSubmitDom();
    runScript(section);
    (section.querySelector('[data-checkout-submit]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 10));

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => /\/address$/.test(u))).toBe(false);
    expect(urls.some((u) => /\/delivery\/select$/.test(u))).toBe(false);

    const checkout = bodyOf(fetchMock, /\/checkout$/);
    expect(checkout.metadata.deliveryMethod).toEqual({ type: 'none', costCents: 0 });
    expect('deliveryAddress' in checkout.metadata).toBe(false);
  });

  it('дефолт → PATCH /address вызывается (регресс)', async () => {
    setConfig(undefined);
    const fetchMock = chainFetchMock();
    (window as any).fetch = fetchMock;
    const section = mountSubmitDom();
    runScript(section);
    selectDelivery(SELF_PICKUP);
    (section.querySelector('[data-checkout-submit]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock.mock.calls.map((c) => String(c[0])).some((u) => /\/address$/.test(u))).toBe(true);
  });
});

// ── customerNameMode ──────────────────────────────────────────────────────────
describe('CheckoutSubmit — customerNameMode gate + name payload', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    baseCart();
    (window as any).fetch = jest.fn();
    delete (window as any).location;
    (window as any).location = { origin: 'https://shop.test', href: '' };
  });
  afterEach(cleanup);

  it("name-surname (дефолт) → name = «Имя Фамилия»", async () => {
    setConfig(undefined);
    const fetchMock = chainFetchMock();
    (window as any).fetch = fetchMock;
    const section = mountSubmitDom();
    runScript(section);
    selectDelivery(SELF_PICKUP);
    (section.querySelector('[data-checkout-submit]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 10));
    expect(bodyOf(fetchMock, /\/customer$/).name).toBe('Иван Петров');
    expect(bodyOf(fetchMock, /\/checkout$/).metadata.customerName).toBe('Иван Петров');
  });

  it("surname → gate требует только Фамилию; name = «Фамилия»", async () => {
    setConfig({ customerNameMode: 'surname' });
    const fetchMock = chainFetchMock();
    (window as any).fetch = fetchMock;
    const section = mountSubmitDom({ firstName: '' });
    runScript(section);
    const btn = section.querySelector('[data-checkout-submit]') as HTMLButtonElement;
    selectDelivery(SELF_PICKUP);
    expect(btn.disabled).toBe(false); // firstName пуст, но surname-режим его не требует
    btn.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(bodyOf(fetchMock, /\/customer$/).name).toBe('Петров');
    const checkout = bodyOf(fetchMock, /\/checkout$/);
    expect(checkout.metadata.customerName).toBe('Петров');
    expect(checkout.metadata.deliveryAddress.firstName).toBe(''); // скрытый компонент пуст
    expect(checkout.metadata.deliveryAddress.lastName).toBe('Петров');
  });

  it("name → gate требует только Имя; name = «Имя»", async () => {
    setConfig({ customerNameMode: 'name' });
    const fetchMock = chainFetchMock();
    (window as any).fetch = fetchMock;
    const section = mountSubmitDom({ lastName: '' });
    runScript(section);
    const btn = section.querySelector('[data-checkout-submit]') as HTMLButtonElement;
    selectDelivery(SELF_PICKUP);
    expect(btn.disabled).toBe(false);
    btn.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(bodyOf(fetchMock, /\/customer$/).name).toBe('Иван');
    expect(bodyOf(fetchMock, /\/checkout$/).metadata.deliveryAddress.lastName).toBe('');
  });

  it("name-surname → пустое Имя блокирует кнопку (name-гейт)", () => {
    setConfig(undefined);
    const section = mountSubmitDom({ firstName: '' });
    runScript(section);
    const btn = section.querySelector('[data-checkout-submit]') as HTMLButtonElement;
    selectDelivery(SELF_PICKUP);
    expect(btn.disabled).toBe(true);
  });
});

// ── применение по событию checkout:config-ready ───────────────────────────────
describe('CheckoutSubmit — применяет конфиг по событию checkout:config-ready', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    baseCart();
    (window as any).fetch = jest.fn();
  });
  afterEach(cleanup);

  it('phone пуст: disabled при дефолте, enabled после config-ready(contactMethod=email)', () => {
    setConfig(undefined); // конфиг есть на init, но без checkout → email-phone
    const section = mountSubmitDom({ phone: '' });
    runScript(section);
    const btn = section.querySelector('[data-checkout-submit]') as HTMLButtonElement;
    selectDelivery(SELF_PICKUP);
    expect(btn.disabled).toBe(true); // phone обязателен по дефолту

    (window as any).__MERFY_CONFIG__.checkout = { contactMethod: 'email' };
    document.dispatchEvent(new CustomEvent('checkout:config-ready'));
    expect(btn.disabled).toBe(false); // событие пере-оценило гейт
  });
});

// ── FIX 1: fullName-раскладка (splitFirstLast:false) ─────────────────────────
// Регрессия: гейт имени жёстко требовал split-полей firstName/lastName. Но
// CheckoutDeliveryForm рендерит ЛИБО split, ЛИБО одно поле fullName. При
// fullName-раскладке split-полей нет → getField('')=='' → кнопка вечно disabled
// даже на дефолтных настройках. Гейт теперь зеркалит fullName-fallback buildCustomerName.
describe('CheckoutSubmit — FIX 1: гейт имени при fullName-раскладке', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    baseCart();
    (window as any).fetch = jest.fn();
    delete (window as any).location;
    (window as any).location = { origin: 'https://shop.test', href: '' };
  });
  afterEach(cleanup);

  it('дефолт name-surname + заполненный fullName (нет split-полей) → кнопка ENABLED (регресс закрыта)', () => {
    setConfig(undefined); // дефолт name-surname
    const section = mountSubmitDomFullNameOnly();
    runScript(section);
    const btn = section.querySelector('[data-checkout-submit]') as HTMLButtonElement;
    selectDelivery(SELF_PICKUP);
    expect(btn.disabled).toBe(false); // fullName-fallback закрывает гейт имени
  });

  it('пустой fullName (нет split-полей) → кнопка DISABLED', () => {
    setConfig(undefined);
    const section = mountSubmitDomFullNameOnly({ fullName: '' });
    runScript(section);
    const btn = section.querySelector('[data-checkout-submit]') as HTMLButtonElement;
    selectDelivery(SELF_PICKUP);
    expect(btn.disabled).toBe(true); // ни split, ни fullName — имя не заполнено
  });

  it('surname-режим: только fullName (нет lastName-поля) → ENABLED', () => {
    setConfig({ customerNameMode: 'surname' });
    const section = mountSubmitDomFullNameOnly();
    runScript(section);
    const btn = section.querySelector('[data-checkout-submit]') as HTMLButtonElement;
    selectDelivery(SELF_PICKUP);
    expect(btn.disabled).toBe(false);
  });

  it('split-раскладка НЕ сломана: name-surname с firstName+lastName → ENABLED', () => {
    setConfig(undefined);
    const section = mountSubmitDom(); // split-поля заполнены, fullName пуст
    runScript(section);
    const btn = section.querySelector('[data-checkout-submit]') as HTMLButtonElement;
    selectDelivery(SELF_PICKUP);
    expect(btn.disabled).toBe(false);
  });
});

// ── M16: pickup-типы адрес-независимы в гейте canSubmit ───────────────────────
// addressRequired=true раньше жёстко требовал city+street для ЛЮБОГО способа
// доставки. Но самовывоз (self_pickup) и CDEK-ПВЗ (cdek_pickup) физического
// адреса не имеют — гейт теперь пропускает их без city/street (зеркало серверного
// «не-курьер»). Курьерские типы (cdek_door / custom) по-прежнему требуют адрес,
// cdek_door дополнительно — building, cdek_pickup — выбранный pickupPointCode.
describe('CheckoutSubmit — M16: pickup адрес-независим, курьер требует адрес', () => {
  const CDEK_PICKUP_NO_CODE = { type: 'cdek_pickup', label: 'CDEK ПВЗ', costCents: 30000, tariffCode: 136 };
  const CDEK_PICKUP_WITH_CODE = { ...CDEK_PICKUP_NO_CODE, pickupPointCode: 'MSK123' };
  const CDEK_DOOR = { type: 'cdek_door', label: 'CDEK курьер', costCents: 40000, tariffCode: 137 };

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    baseCart();
    (window as any).fetch = jest.fn();
    delete (window as any).location;
    (window as any).location = { origin: 'https://shop.test', href: '' };
  });
  afterEach(cleanup);

  it('addressRequired(дефолт) + self_pickup + пустой city/street → кнопка ENABLED', () => {
    setConfig(undefined);
    const section = mountSubmitDom({ city: '', street: '', building: '' });
    runScript(section);
    const btn = section.querySelector('[data-checkout-submit]') as HTMLButtonElement;
    selectDelivery(SELF_PICKUP);
    expect(btn.disabled).toBe(false); // самовывоз адрес-независим
  });

  it('cdek_pickup без pickupPointCode → кнопка DISABLED (ПВЗ не выбран)', () => {
    setConfig(undefined);
    const section = mountSubmitDom({ city: '', street: '' });
    runScript(section);
    const btn = section.querySelector('[data-checkout-submit]') as HTMLButtonElement;
    selectDelivery(CDEK_PICKUP_NO_CODE);
    expect(btn.disabled).toBe(true);
  });

  it('cdek_pickup c pickupPointCode + пустой city/street → кнопка ENABLED (ПВЗ адрес-независим)', () => {
    setConfig(undefined);
    const section = mountSubmitDom({ city: '', street: '' });
    runScript(section);
    const btn = section.querySelector('[data-checkout-submit]') as HTMLButtonElement;
    selectDelivery(CDEK_PICKUP_WITH_CODE);
    expect(btn.disabled).toBe(false);
  });

  it('cdek_door + пустой city/street → кнопка DISABLED (курьер требует адрес)', () => {
    setConfig(undefined);
    const section = mountSubmitDom({ city: '', street: '' });
    runScript(section);
    const btn = section.querySelector('[data-checkout-submit]') as HTMLButtonElement;
    selectDelivery(CDEK_DOOR);
    expect(btn.disabled).toBe(true);
  });

  it('cdek_door + city/street есть, building пусто → кнопка DISABLED', () => {
    setConfig(undefined);
    const section = mountSubmitDom({ building: '' });
    runScript(section);
    const btn = section.querySelector('[data-checkout-submit]') as HTMLButtonElement;
    selectDelivery(CDEK_DOOR);
    expect(btn.disabled).toBe(true);
  });

  it('cdek_door + полный адрес (city/street/building) → кнопка ENABLED', () => {
    setConfig(undefined);
    const section = mountSubmitDom(); // адрес заполнен по умолчанию
    runScript(section);
    const btn = section.querySelector('[data-checkout-submit]') as HTMLButtonElement;
    selectDelivery(CDEK_DOOR);
    expect(btn.disabled).toBe(false);
  });
});

// ── buildCustomerName: fullName-fallback во ВСЕ режимы ─────────────────────────
// При fullName-раскладке (splitFirstLast:false) split-полей firstName/lastName нет.
// Без fallback surname/name вернули бы '' → PATCH /customer шлёт name='' → серверный
// энфорс имени (H3) ложно реджектит. Fallback: surname→ln||full, name→fn||full.
describe('CheckoutSubmit — buildCustomerName fullName-fallback (payload)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    baseCart();
    (window as any).fetch = jest.fn();
    delete (window as any).location;
    (window as any).location = { origin: 'https://shop.test', href: '' };
  });
  afterEach(cleanup);

  it('surname-режим, только fullName (нет lastName-поля) → PATCH /customer name = fullName (не пусто)', async () => {
    setConfig({ customerNameMode: 'surname' });
    const fetchMock = chainFetchMock();
    (window as any).fetch = fetchMock;
    const section = mountSubmitDomFullNameOnly(); // fullName='Иван Петров', split-полей нет
    runScript(section);
    selectDelivery(SELF_PICKUP);
    (section.querySelector('[data-checkout-submit]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 10));
    const customer = bodyOf(fetchMock, /\/customer$/);
    expect(customer.name).toBe('Иван Петров'); // ln='' → fallback на fullName
    expect(bodyOf(fetchMock, /\/checkout$/).metadata.customerName).toBe('Иван Петров');
  });

  it('name-режим, только fullName (нет firstName-поля) → PATCH /customer name = fullName', async () => {
    setConfig({ customerNameMode: 'name' });
    const fetchMock = chainFetchMock();
    (window as any).fetch = fetchMock;
    const section = mountSubmitDomFullNameOnly();
    runScript(section);
    selectDelivery(SELF_PICKUP);
    (section.querySelector('[data-checkout-submit]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 10));
    expect(bodyOf(fetchMock, /\/customer$/).name).toBe('Иван Петров');
  });

  it('surname-режим со split lastName → name = «Фамилия» (fallback не перебивает заполненный ln)', async () => {
    setConfig({ customerNameMode: 'surname' });
    const fetchMock = chainFetchMock();
    (window as any).fetch = fetchMock;
    const section = mountSubmitDom({ firstName: '' }); // lastName='Петров', fullName=''
    runScript(section);
    selectDelivery(SELF_PICKUP);
    (section.querySelector('[data-checkout-submit]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 10));
    expect(bodyOf(fetchMock, /\/customer$/).name).toBe('Петров');
  });
});

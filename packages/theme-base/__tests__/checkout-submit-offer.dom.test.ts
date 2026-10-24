/**
 * @jest-environment jsdom
 *
 * CheckoutSubmit в режиме оплаты предложения расширения (`/checkout?offer=…`,
 * spec 120 Б10): одна заявка на /pay/<токен>/offer/checkout вместо цепочки
 * «корзина → заказ → платёж». Проверяем:
 *  - кнопка включается только после загрузки предложения, телефон обязателен,
 *    регистрация магазина (requireCustomerAuth) не требуется;
 *  - в запросе версия, имя, телефон, адрес и ВЫБОР доставки — ни цен, ни итогов;
 *  - корзина покупателя не трогается: ни запросов к корзине/промокоду, ни записи
 *    в localStorage/sessionStorage;
 *  - отказы сервера объясняются (изменилось предложение, нет товара, тариф ушёл),
 *    «уже оплачен»/«ссылка закрыта» ведут на страницу ссылки шлюза;
 *  - вне режима (нет window.__merfyOffer) поведение прежнее.
 */
import { join } from 'path';
import { astroInlineRunners } from './helpers/astro-inline-script';

const ASTRO = join(__dirname, '..', 'blocks', 'CheckoutSubmit', 'CheckoutSubmit.astro');
const TOKEN = 'T'.repeat(43);
const API = 'https://gateway.test/api';
const CHECKOUT_URL = `${API}/pay/${TOKEN}/offer/checkout?store_id=shop1`;

const OFFER_DATA = {
  version: 4,
  email: 'buyer@example.com',
  deliveryRequired: true,
  items: [],
};

function mountDom(overrides: Record<string, string> = {}): HTMLElement {
  const v = {
    email: 'buyer@example.com', phone: '+79990000000',
    firstName: 'Иван', lastName: 'Петров', fullName: '',
    city: 'Москва', postalCode: '101000', street: 'Тверская',
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
  astroInlineRunners(ASTRO)[0].run({
    buttonText: 'Оплатить {total}',
    loadingText: 'Обработка…',
    successRedirectUrl: '/checkout-result',
    blockId: 'cs-1',
  });
}

function setConfig(checkout: Record<string, unknown> = {}) {
  (window as any).__MERFY_CONFIG__ = {
    shopId: 'shop1',
    apiUrl: API,
    checkout: { addressRequired: true, requireCustomerAuth: false, ...checkout },
  };
}

/** Как runtime/checkout-offer.ts: состояние + хранилище позиций только для чтения. */
function setOffer(loaded: boolean, data: Record<string, unknown> = OFFER_DATA) {
  const MESSAGES: Record<string, string> = {
    offer_changed: 'Продавец изменил заказ. Обновляем страницу…',
    delivery_option_unavailable: 'Выбранный способ доставки больше недоступен. Выберите другой',
  };
  (window as any).__merfyOffer = {
    token: TOKEN,
    loaded,
    error: '',
    data: loaded ? data : null,
    message: (code: string, details?: { itemName?: string }) =>
      code === 'insufficient_stock' && details?.itemName
        ? `Товара «${details.itemName}» нет в нужном количестве. Свяжитесь с продавцом`
        : MESSAGES[code] ?? 'Не удалось оформить заказ',
  };
  (window as any).cartStore = {
    getItems: () => [
      { id: 'l1', productId: 'p1', quantity: 2, unitPriceCents: 150000 },
    ],
    getTotal: () => 300000,
    getServerCart: () => null,
    syncToServer: jest.fn(async () => null),
  };
}

function selectDelivery(detail: Record<string, unknown>) {
  document.dispatchEvent(new CustomEvent('checkout:delivery-changed', { detail }));
}

const CARRIER_DOOR = {
  type: 'cdek_door', carrier: 'cdek', mode: 'door', requiresPickupPoint: false,
  shipmentRequired: true, tariffCode: '137', label: 'Курьер', costCents: 39000,
  periodMin: 2, periodMax: 4,
};
const OWN_TARIFF = {
  type: 'custom', carrier: null, mode: 'own', requiresPickupPoint: false,
  customTariffId: 'own-1', label: 'Курьер магазина', costCents: 30000,
};
const SELF_PICKUP = {
  type: 'self_pickup', carrier: null, mode: 'self_pickup', pickupPointId: 'pp1',
  label: 'Самовывоз', costCents: 0,
};
const PVZ = {
  type: 'cdek_pickup', carrier: 'cdek', mode: 'pickup', requiresPickupPoint: true,
  shipmentRequired: true, tariffCode: '136', label: 'ПВЗ', costCents: 25000,
  pickupPointCode: 'MSK123', pickupPointAddress: 'Москва, Тверская 7',
};

const btnOf = (s: HTMLElement) => s.querySelector('[data-checkout-submit]') as HTMLButtonElement;
const errorOf = (s: HTMLElement) => s.querySelector('[data-checkout-submit-error]') as HTMLElement;

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
}

const click = async (s: HTMLElement) => {
  btnOf(s).click();
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
};

let fetchMock: jest.Mock;

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  setConfig();
  fetchMock = jest.fn(() =>
    jsonResponse(200, { success: true, data: { redirectUrl: 'https://pay.test/c/1' } }),
  );
  (window as any).fetch = fetchMock;
  delete (window as any).location;
  (window as any).location = {
    origin: 'https://shop.test', href: '', reload: jest.fn(), replace: jest.fn(),
  };
});

afterEach(() => {
  jest.useRealTimers();
  delete (window as any).cartStore;
  delete (window as any).fetch;
  delete (window as any).__merfyRoot;
  delete (window as any).__merfyOffer;
  delete (window as any).__MERFY_CONFIG__;
});

describe('CheckoutSubmit — оплата предложения: кнопка', () => {
  it('пока предложение не загрузилось — выключена; после checkout:offer-ready и выбора доставки — включена', () => {
    setOffer(false);
    const section = mountDom();
    runScript(section);
    selectDelivery(OWN_TARIFF);
    expect(btnOf(section).disabled).toBe(true);

    setOffer(true);
    document.dispatchEvent(new CustomEvent('checkout:offer-ready', { detail: OFFER_DATA }));
    expect(btnOf(section).disabled).toBe(false);
    // Итог на кнопке — позиции предложения + выбранная доставка (показ, считает сервер).
    expect(btnOf(section).textContent).toMatch(/3\s300/);
  });

  it('ошибка загрузки предложения объясняется и кнопка остаётся выключенной', () => {
    setOffer(false);
    const section = mountDom();
    runScript(section);
    document.dispatchEvent(
      new CustomEvent('checkout:offer-error', { detail: { code: 'offer_changed' } }),
    );
    expect(errorOf(section).hidden).toBe(false);
    expect(errorOf(section).textContent).toBe('Продавец изменил заказ. Обновляем страницу…');
    expect(btnOf(section).disabled).toBe(true);
  });

  it('телефон обязателен, пока нужна физическая доставка', () => {
    setOffer(true);
    const section = mountDom({ phone: '' });
    runScript(section);
    selectDelivery(OWN_TARIFF);
    expect(btnOf(section).disabled).toBe(true);
  });

  it('магазин без физической доставки: телефон и доставка не нужны', () => {
    setConfig({ addressRequired: false });
    setOffer(true, { ...OFFER_DATA, deliveryRequired: false });
    const section = mountDom({ phone: '', city: '', street: '' });
    runScript(section);
    expect(btnOf(section).disabled).toBe(false);
  });

  it('обязательная регистрация магазина на предложение не действует: гостя не блокируем', () => {
    setConfig({ requireCustomerAuth: true });
    setOffer(true);
    const section = mountDom();
    runScript(section);
    selectDelivery(OWN_TARIFF);
    expect(btnOf(section).disabled).toBe(false);
    expect(errorOf(section).hidden).toBe(true);
  });

  it('адрес и способ доставки нужны так же, как в обычном чекауте', () => {
    setOffer(true);
    const section = mountDom({ city: '' });
    runScript(section);
    expect(btnOf(section).disabled).toBe(true); // доставка не выбрана
    selectDelivery(CARRIER_DOOR);
    expect(btnOf(section).disabled).toBe(true); // курьеру нужен город
    selectDelivery(PVZ);
    expect(btnOf(section).disabled).toBe(false); // пункту выдачи город не нужен
    selectDelivery({ ...PVZ, pickupPointCode: null });
    expect(btnOf(section).disabled).toBe(true); // пункт не выбран
  });
});

describe('CheckoutSubmit — оплата предложения: заявка', () => {
  it('одна заявка: версия, имя, телефон, адрес и выбор доставки; цен нет; корзина и хранилища не тронуты; уход на платёжку', async () => {
    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    const removeItem = jest.spyOn(Storage.prototype, 'removeItem');
    setOffer(true);
    const section = mountDom();
    runScript(section);
    selectDelivery(CARRIER_DOOR);
    await click(section);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(CHECKOUT_URL);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      version: 4,
      customer: { name: 'Иван Петров', phone: '+79990000000' },
      paymentMethod: 'bank_card',
      address: {
        city: 'Москва',
        street: 'Тверская',
        house: '1',
        apartment: '5',
        postalCode: '101000',
        fiasId: 'fias-1',
      },
      delivery: {
        carrier: 'cdek',
        mode: 'door',
        tariffCode: '137',
        customTariffId: null,
        pickupPointId: null,
        pickupPointCode: null,
        pickupPointAddress: null,
      },
    });
    // Ни цены доставки, ни итога, ни сроков — их считает сервер.
    expect(init.body).not.toMatch(/costCents|price|total|period/i);
    expect((window as any).location.href).toBe('https://pay.test/c/1');
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect((window as any).cartStore.syncToServer).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it.each([
    ['свой тариф магазина', OWN_TARIFF, { customTariffId: 'own-1', carrier: null, mode: 'own' }],
    ['самовывоз', SELF_PICKUP, { pickupPointId: 'pp1', carrier: null, mode: 'self_pickup' }],
    ['пункт выдачи', PVZ, { carrier: 'cdek', mode: 'pickup', tariffCode: '136', pickupPointCode: 'MSK123', pickupPointAddress: 'Москва, Тверская 7' }],
  ])('%s: уходят идентификаторы варианта', async (_name, selection, expected) => {
    setOffer(true);
    const section = mountDom();
    runScript(section);
    selectDelivery(selection);
    await click(section);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.delivery).toMatchObject(expected);
  });

  it('способ оплаты из блока «Платёжная система»', async () => {
    setOffer(true);
    const section = mountDom();
    runScript(section);
    selectDelivery(OWN_TARIFF);
    document.dispatchEvent(
      new CustomEvent('checkout:payment-method-changed', { detail: { method: 'sbp' } }),
    );
    await click(section);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).paymentMethod).toBe('sbp');
  });

  it('магазин без физической доставки: ни адреса, ни доставки в заявке', async () => {
    setConfig({ addressRequired: false });
    setOffer(true, { ...OFFER_DATA, deliveryRequired: false });
    const section = mountDom({ phone: '' });
    runScript(section);
    await click(section);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).not.toHaveProperty('address');
    expect(body).not.toHaveProperty('delivery');
    expect(body.customer).toEqual({ name: 'Иван Петров', phone: null });
  });

  it('двойной клик: вторая заявка не уходит, пока идёт первая', async () => {
    let release!: (v: unknown) => void;
    fetchMock.mockImplementation(
      () => new Promise((resolve) => { release = resolve; }),
    );
    setOffer(true);
    const section = mountDom();
    runScript(section);
    selectDelivery(OWN_TARIFF);
    btnOf(section).click();
    btnOf(section).click();
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release({ ok: true, status: 200, json: async () => ({ success: true, data: { redirectUrl: 'https://pay.test/c/2' } }) });
    await new Promise((r) => setTimeout(r, 0));
  });
});

describe('CheckoutSubmit — оплата предложения: отказы сервера', () => {
  const failWith = (status: number, code: string, extra: Record<string, unknown> = {}) =>
    fetchMock.mockImplementation(() =>
      jsonResponse(status, { statusCode: status, message: code, code, ...extra }),
    );

  async function submitWithFailure(status: number, code: string, extra?: Record<string, unknown>) {
    failWith(status, code, extra);
    setOffer(true);
    const section = mountDom();
    runScript(section);
    selectDelivery(OWN_TARIFF);
    await click(section);
    return section;
  }

  it('предложение изменилось: объясняем, кнопка снова доступна, страница обновится сама', async () => {
    jest.useFakeTimers();
    failWith(409, 'offer_changed');
    setOffer(true);
    const section = mountDom();
    runScript(section);
    selectDelivery(OWN_TARIFF);
    btnOf(section).click();
    await jest.advanceTimersByTimeAsync(0);

    expect(errorOf(section).textContent).toBe('Продавец изменил заказ. Обновляем страницу…');
    expect(btnOf(section).disabled).toBe(false);
    expect((window as any).location.reload).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1500);
    expect((window as any).location.reload).toHaveBeenCalledTimes(1);
  });

  it('товара не хватает: название товара из ответа', async () => {
    const section = await submitWithFailure(409, 'insufficient_stock', { itemName: 'Футболка' });
    expect(errorOf(section).textContent).toBe(
      'Товара «Футболка» нет в нужном количестве. Свяжитесь с продавцом',
    );
    expect(btnOf(section).disabled).toBe(false);
  });

  it('тариф ушёл из расчёта: просим выбрать другой', async () => {
    const section = await submitWithFailure(409, 'delivery_option_unavailable');
    expect(errorOf(section).textContent).toBe(
      'Выбранный способ доставки больше недоступен. Выберите другой',
    );
  });

  it.each(['already_paid', 'pay_link_invalid'])(
    '%s — страница ссылки шлюза показывает состояние заказа',
    async (code) => {
      await submitWithFailure(code === 'already_paid' ? 409 : 404, code);
      expect((window as any).location.href).toBe(`${API}/pay/${TOKEN}`);
    },
  );

  it('сеть упала: общий текст, кнопка снова доступна', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error('offline')));
    setOffer(true);
    const section = mountDom();
    runScript(section);
    selectDelivery(OWN_TARIFF);
    await click(section);
    expect(errorOf(section).hidden).toBe(false);
    expect(btnOf(section).disabled).toBe(false);
  });
});

describe('CheckoutSubmit — вне режима предложения прежнее поведение', () => {
  it('регистрация обязательна и токена нет — кнопка выключена; телефон по contactMethod', () => {
    setConfig({ requireCustomerAuth: true });
    (window as any).cartStore = {
      getItems: () => [{ id: 'i1', productId: 'p1', quantity: 1, unitPriceCents: 100000 }],
      getTotal: () => 100000,
    };
    const section = mountDom();
    runScript(section);
    selectDelivery(OWN_TARIFF);
    expect(btnOf(section).disabled).toBe(true);
  });

  it('при оформлении идёт цепочка корзины, а не заявка предложения', async () => {
    (window as any).localStorage.setItem('merfy:cartId', 'cart1');
    (window as any).cartStore = {
      getItems: () => [{ id: 'i1', productId: 'p1', quantity: 1, unitPriceCents: 100000 }],
      getTotal: () => 100000,
      syncToServer: jest.fn(async () => 'cart1'),
    };
    fetchMock.mockImplementation((url: string) => {
      if (/\/checkout$/.test(url)) {
        return jsonResponse(200, { data: { orderId: 'o1' } });
      }
      if (/\/create-payment$/.test(url)) {
        return jsonResponse(200, { data: { confirmationUrl: 'https://pay.test/x' } });
      }
      return jsonResponse(200, {});
    });
    const section = mountDom();
    runScript(section);
    selectDelivery(SELF_PICKUP);
    await click(section);

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => /\/orders\/cart\/cart1\/checkout$/.test(u))).toBe(true);
    expect(urls.some((u) => /\/pay\//.test(u))).toBe(false);
    expect((window as any).location.href).toBe('https://pay.test/x');
  });
});

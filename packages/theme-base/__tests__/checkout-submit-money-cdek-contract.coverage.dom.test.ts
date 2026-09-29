/**
 * @jest-environment jsdom
 *
 * CheckoutSubmit — контракт денег и данных СДЭК в запросах сабмита (ревью):
 *  - точная цепочка URL по способу доставки: cdek_pickup шлёт
 *    .../delivery/select ПЕРЕД .../checkout; cdek_door — без /delivery/select
 *    вовсе (раньше проверялось только findIndex >= 0 / < для двух URL, не вся
 *    цепочка целиком);
 *  - тело POST /delivery/select целиком: тип, НЕНУЛЕВАЯ цена, тариф, код и
 *    адрес точки, разобранный адрес (включая переименование building→house) —
 *    раньше проверяли только 4 поля из этого набора через .toMatchObject;
 *  - metadata.deliveryMethod в теле /checkout целиком для ФИЗИЧЕСКОГО товара
 *    (cdek_door и cdek_pickup) — раньше toEqual был только у цифровой ветки
 *    {type:'none',costCents:0} (checkout-submit-config.dom.test.ts);
 *  - оплата уходит по orderId (созданному на /checkout), а НЕ по cartId.
 *
 * Разметка — как в checkout-submit-cdek-pickup.dom.test.ts (тот же набор
 * секций/полей), чтобы не разойтись с уже стабильным сценарием.
 */
import { join } from "path";
import { astroInlineRunners } from "./helpers/astro-inline-script";

const ASTRO = join(
  __dirname,
  "..",
  "blocks",
  "CheckoutSubmit",
  "CheckoutSubmit.astro",
);

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
  return document.querySelector(
    '[data-block="checkout-submit"]',
  ) as HTMLElement;
}

function runScript(section: HTMLElement) {
  (window as any).__merfyRoot = () => section;
  astroInlineRunners(ASTRO)[0].run({
    buttonText: "Оформить — {total}",
    loadingText: "Оформляем…",
    successRedirectUrl: "/checkout/result",
    blockId: "cs-1",
  });
}

function selectDelivery(detail: Record<string, unknown>) {
  document.dispatchEvent(
    new CustomEvent("checkout:delivery-changed", { detail }),
  );
}

/** Цепочка ok:true на все шаги; orderId ('o1') НАРОЧНО отличается от cartId
 * ('cart_new') — так падение "оплата ушла по cartId" ловится по URL. */
function chainFetchMock(): jest.Mock {
  return jest.fn((url: string) => {
    if (/\/delivery\/select$/.test(url))
      return Promise.resolve({ ok: true, json: async () => ({ data: {} }) });
    if (/\/checkout$/.test(url))
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ data: { orderId: "o1" } }),
      });
    if (/\/create-payment$/.test(url))
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: { confirmationUrl: "https://pay.test/x" } }),
      });
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

const bodyOf = (mock: jest.Mock, re: RegExp) => {
  const call = mock.mock.calls.find((c) => re.test(String(c[0])));
  return call ? JSON.parse((call[1] as any).body) : null;
};
const urlsOf = (mock: jest.Mock) => mock.mock.calls.map((c) => String(c[0]));

async function submit(section: HTMLElement) {
  (
    section.querySelector("[data-checkout-submit]") as HTMLButtonElement
  ).click();
  await new Promise((r) => setTimeout(r, 10));
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  (window as any).cartStore = {
    getItems: () => [
      { id: "i1", productId: "p1", quantity: 1, unitPriceCents: 100000 },
    ],
    getTotal: () => 100000,
    syncToServer: jest.fn(async () => "cart_new"),
  };
  (window as any).__MERFY_CONFIG__ = {
    shopId: "shop1",
    apiUrl: "https://gateway.test/api",
  };
  (window as any).__checkoutTokenizeCard = undefined;
  delete (window as any).location;
  (window as any).location = { origin: "https://shop.test", href: "" };
});
afterEach(() => {
  delete (window as any).cartStore;
  delete (window as any).fetch;
  delete (window as any).__merfyRoot;
  delete (window as any).__MERFY_CONFIG__;
  delete (window as any).__checkoutTokenizeCard;
});

describe("CheckoutSubmit — цепочка URL целиком по способу доставки", () => {
  it("cdek_pickup: customer → address → delivery/select → checkout(cart_new) → create-payment(orderId, НЕ cartId)", async () => {
    const fetchMock = chainFetchMock();
    (window as any).fetch = fetchMock;
    const section = mountSubmitDom();
    runScript(section);
    selectDelivery({
      type: "cdek_pickup",
      label: "До пункта выдачи",
      costCents: 30000,
      tariffCode: 138,
      pickupPointCode: "PVZ77",
      pickupPointAddress: "ул. Тестовая, 1",
    });
    await submit(section);

    expect(urlsOf(fetchMock)).toEqual([
      "https://gateway.test/api/orders/cart/cart_new/customer",
      "https://gateway.test/api/orders/cart/cart_new/address",
      "https://gateway.test/api/store/carts/cart_new/delivery/select",
      "https://gateway.test/api/orders/cart/cart_new/checkout",
      "https://gateway.test/api/orders/o1/create-payment",
    ]);
  });

  it("cdek_door: customer → address → checkout(cart_new) → create-payment(orderId) — БЕЗ /delivery/select", async () => {
    const fetchMock = chainFetchMock();
    (window as any).fetch = fetchMock;
    const section = mountSubmitDom();
    runScript(section);
    selectDelivery({
      type: "cdek_door",
      label: "Курьер до двери",
      costCents: 79500,
      tariffCode: 137,
    });
    await submit(section);

    expect(urlsOf(fetchMock)).toEqual([
      "https://gateway.test/api/orders/cart/cart_new/customer",
      "https://gateway.test/api/orders/cart/cart_new/address",
      "https://gateway.test/api/orders/cart/cart_new/checkout",
      "https://gateway.test/api/orders/o1/create-payment",
    ]);
  });
});

describe("CheckoutSubmit — тело POST /delivery/select целиком (cdek_pickup)", () => {
  it("type, ненулевая цена, тариф, код+адрес точки, адрес с переименованием building→house", async () => {
    const fetchMock = chainFetchMock();
    (window as any).fetch = fetchMock;
    const section = mountSubmitDom();
    runScript(section);
    selectDelivery({
      type: "cdek_pickup",
      label: "До пункта выдачи",
      costCents: 30000,
      tariffCode: 138,
      pickupPointCode: "PVZ77",
      pickupPointAddress: "ул. Тестовая, 1",
    });
    await submit(section);

    expect(bodyOf(fetchMock, /\/delivery\/select$/)).toEqual({
      type: "cdek_pickup",
      deliveryCostCents: 30000, // ненулевая цена ушла как есть
      tariffCode: 138,
      pickupPointCode: "PVZ77",
      pickupPointAddress: "ул. Тестовая, 1",
      address: {
        city: "Москва",
        street: "Ленина",
        house: "1", // building → house (ShippingAddressDto)
        apartment: "5",
        postalCode: "101000",
        fiasId: "fias-1",
        fullAddress: "Ленина, д. 1, кв. 5",
      },
    });
  });
});

describe("CheckoutSubmit — metadata.deliveryMethod в /checkout целиком (физический товар)", () => {
  it("cdek_pickup — все 10 полей способа доставки, включая код/адрес точки", async () => {
    const fetchMock = chainFetchMock();
    (window as any).fetch = fetchMock;
    const section = mountSubmitDom();
    runScript(section);
    selectDelivery({
      type: "cdek_pickup",
      label: "До пункта выдачи",
      costCents: 30000,
      tariffCode: 138,
      pickupPointCode: "PVZ77",
      pickupPointAddress: "ул. Тестовая, 1",
    });
    await submit(section);

    expect(bodyOf(fetchMock, /\/checkout$/).metadata.deliveryMethod).toEqual({
      type: "cdek_pickup",
      label: "До пункта выдачи",
      costCents: 30000,
      tariffCode: 138,
      customTariffId: null,
      pickupPointId: null,
      pickupPointCode: "PVZ77",
      pickupPointAddress: "ул. Тестовая, 1",
      periodMin: null,
      periodMax: null,
    });
  });

  it("cdek_door — все 10 полей, код/адрес точки отсутствуют (null)", async () => {
    const fetchMock = chainFetchMock();
    (window as any).fetch = fetchMock;
    const section = mountSubmitDom();
    runScript(section);
    selectDelivery({
      type: "cdek_door",
      label: "Курьер до двери",
      costCents: 79500,
      tariffCode: 137,
    });
    await submit(section);

    expect(bodyOf(fetchMock, /\/checkout$/).metadata.deliveryMethod).toEqual({
      type: "cdek_door",
      label: "Курьер до двери",
      costCents: 79500,
      tariffCode: 137,
      customTariffId: null,
      pickupPointId: null,
      pickupPointCode: null,
      pickupPointAddress: null,
      periodMin: null,
      periodMax: null,
    });
  });
});

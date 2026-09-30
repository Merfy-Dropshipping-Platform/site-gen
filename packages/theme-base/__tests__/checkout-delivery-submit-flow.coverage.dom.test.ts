/**
 * @jest-environment jsdom
 *
 * СКВОЗНОЙ тест (ревью, пункт 2): CheckoutDeliveryMethod и CheckoutSubmit
 * работают ОДНОВРЕМЕННО в одном DOM, каждый через свой astroInlineRunners,
 * `window.__merfyRoot` ищет корень по `data-puck-component-id` — как в
 * реальной сборке (`src/common/block-root-inline.ts`), а не подставлен вручную
 * под конкретный блок.
 *
 * Покупатель НЕ подаёт `checkout:delivery-changed` руками — только то, что он
 * реально делает: вводит адрес (эмулируем публичным событием
 * `checkout:address-changed`, которое в проде диспатчит CheckoutDeliveryForm)
 * и кликает мышкой по карточкам/кнопке. Разметка обоих блоков — как в уже
 * стабильных `checkout-delivery-pvz-picker.dom.test.ts` и
 * `checkout-submit-cdek-pickup.dom.test.ts`.
 *
 * Сценарий «Курьер»: адрес → расчёт → карточка «Курьер СДЭК до двери» с ценой
 * → клик → кнопка «Оформить» активна → клик → цепочка запросов и
 * metadata.deliveryMethod как в money-contract тестах.
 * Сценарий «ПВЗ»: кнопка неактивна, пока точка не выбрана → выбор точки в
 * пикере → кнопка активна → /delivery/select с кодом точки уходит РАНЬШЕ
 * /checkout.
 */
import { join } from "path";
import { astroInlineRunners } from "./helpers/astro-inline-script";

const DELIVERY_METHOD_ASTRO = join(
  __dirname,
  "..",
  "blocks",
  "CheckoutDeliveryMethod",
  "CheckoutDeliveryMethod.astro",
);
const SUBMIT_ASTRO = join(
  __dirname,
  "..",
  "blocks",
  "CheckoutSubmit",
  "CheckoutSubmit.astro",
);

/** Оба блока + контактные/адресные поля — набор полей как в checkout-submit-cdek-pickup.dom.test.ts. */
function mountDom(): void {
  document.body.innerHTML = `
    <section data-checkout-delivery-method data-puck-component-id="cdm-1"
             data-cdek-enabled="true"
             data-cdek-door-label="Курьер СДЭК до двери"
             data-cdek-pvz-label="Пункт выдачи СДЭК"
             data-cdek-postamat-label="Постамат СДЭК"
             data-pickup-enabled="false"
             data-pickup-label="Самовывоз"
             data-free-shipping-threshold="">
      <div data-checkout-delivery-empty></div>
      <div data-checkout-delivery-loading hidden></div>
      <div data-checkout-delivery-error hidden></div>
      <div data-checkout-delivery-list hidden></div>
      <div data-cdek-pvz-picker hidden></div>
    </section>
    <section data-block="checkout-submit" data-puck-component-id="cs-1">
      <div data-checkout-submit-error role="alert" hidden></div>
      <button data-checkout-submit disabled>Оформить — —</button>
    </section>
    <div data-checkout-delivery data-puck-component-id="cdf-1" data-selected-city-fias-id="fias-msk"></div>
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
}

// document переживает все it() файла, а каждый прогон обоих скриптов вешает
// НОВЫЕ document-level listener'ы (checkout:address-changed, cart:updated,
// checkout:delivery-changed, checkout:config-ready и т.д.). Снимаем между
// тестами — тот же приём, что в checkout-delivery-method.coverage.dom.test.ts,
// иначе тест «ПВЗ» увидит лишние fetch от «осиротевшего» скрипта теста «Курьер».
let capturedDocListeners: Array<[string, EventListenerOrEventListenerObject]> =
  [];

function runInstrumented(runIt: () => void) {
  const originalAdd = document.addEventListener.bind(document);
  (document as any).addEventListener = (
    type: string,
    listener: any,
    opts2?: any,
  ) => {
    capturedDocListeners.push([type, listener]);
    return originalAdd(type, listener, opts2);
  };
  try {
    runIt();
  } finally {
    document.addEventListener = originalAdd;
  }
  jest.clearAllTimers(); // гасим safety-net таймер CheckoutDeliveryMethod (~1500мс)
}

/** Монтирует оба блока через __merfyRoot(id) → document.querySelector по
 * data-puck-component-id — как в реальной сборке (block-root-inline.ts), а не
 * захардкожено под конкретную секцию одного теста. */
function runBothBlocks() {
  (window as any).__merfyRoot = (id: string) =>
    document.querySelector(`[data-puck-component-id="${id}"]`);
  runInstrumented(() => {
    astroInlineRunners(DELIVERY_METHOD_ASTRO)[0].run({ blockId: "cdm-1" });
    astroInlineRunners(SUBMIT_ASTRO)[0].run({
      buttonText: "Оформить — {total}",
      loadingText: "Оформляем…",
      successRedirectUrl: "/checkout/result",
      blockId: "cs-1",
    });
  });
}

/** То, что реально дispatchит CheckoutDeliveryForm при вводе адреса покупателем. */
function customerEntersAddress(detail: Record<string, unknown>) {
  document.dispatchEvent(
    new CustomEvent("checkout:address-changed", { detail }),
  );
}

async function tick(times = 8) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

const submitButton = () =>
  document.querySelector("[data-checkout-submit]") as HTMLButtonElement;
const urlsOf = (mock: jest.Mock) => mock.mock.calls.map((c) => String(c[0]));
const bodyOf = (mock: jest.Mock, re: RegExp) => {
  const call = mock.mock.calls.find((c) => re.test(String(c[0])));
  return call ? JSON.parse((call[1] as any).body) : null;
};

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("merfy:cartId", "cart1");
  (window as any).__MERFY_CONFIG__ = {
    shopId: "shop1",
    apiUrl: "https://gateway.test/api",
  };
  (window as any).cartStore = {
    getItems: () => [
      { id: "i1", productId: "p1", quantity: 1, unitPriceCents: 100000 },
    ],
    getTotal: () => 100000,
    syncToServer: jest.fn(async () => "cart1"), // тот же id, что и merfy:cartId — один сквозной заказ
  };
  delete (window as any).location;
  (window as any).location = { origin: "https://shop.test", href: "" };
});

afterEach(() => {
  capturedDocListeners.forEach(([type, listener]) =>
    document.removeEventListener(type, listener),
  );
  capturedDocListeners = [];
  jest.clearAllTimers();
  jest.useRealTimers();
  delete (window as any).fetch;
  delete (window as any).__merfyRoot;
  delete (window as any).__MERFY_CONFIG__;
  delete (window as any).cartStore;
  document.body.innerHTML = "";
});

describe("Сквозной чекаут — CheckoutDeliveryMethod + CheckoutSubmit в одном DOM", () => {
  it("Курьер СДЭК: адрес → карточка с ценой → клик → кнопка активна → клик «Оформить» → цепочка запросов и metadata.deliveryMethod", async () => {
    const fetchMock = jest.fn((url: string) => {
      if (/\/delivery\/calculate/.test(url))
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              deliveryOptions: [
                {
                  id: "door1",
                  name: "неважно",
                  type: "PARTNER",
                  price: 350,
                  minDays: 1,
                  maxDays: 3,
                  description: "",
                  carrier: "cdek",
                  mode: "door",
                  tariffCode: "137",
                  requiresPickupPoint: false,
                  shipmentRequired: true,
                  label: "Курьер СДЭК до двери",
                },
              ],
              pickupPoints: [],
            },
          }),
        });
      if (/\/customer$/.test(url))
        return Promise.resolve({ ok: true, json: async () => ({}) });
      if (/\/address$/.test(url))
        return Promise.resolve({ ok: true, json: async () => ({}) });
      if (/\/checkout$/.test(url))
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: { orderId: "order-1" } }),
        });
      if (/\/create-payment$/.test(url))
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: { confirmationUrl: "https://pay.test/courier" },
          }),
        });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    (window as any).fetch = fetchMock;
    mountDom();
    runBothBlocks();
    jest.useRealTimers(); // безопасно снимать фейковые таймеры ЗДЕСЬ — safety-net уже погашен внутри runBothBlocks()

    // 1. Покупатель вводит адрес.
    customerEntersAddress({ cityFiasId: "fias-msk", postalCode: "101000" });
    await tick();

    // 2. Карточка «Курьер СДЭК до двери» с ценой видна в списке доставки.
    const card = document.querySelector(
      '[data-delivery-type="cdek_door"]',
    ) as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.querySelector("[data-delivery-label]")!.textContent).toBe(
      "Курьер СДЭК до двери",
    );
    const priceEl = card.lastElementChild as HTMLElement; // последний child карточки — span с ценой
    expect((priceEl.textContent || "").replace(/\s/g, " ")).toBe("350 ₽");

    // 3. Покупатель кликает по карточке.
    card.click();

    // 4. Кнопка «Оформить» активна.
    expect(submitButton().disabled).toBe(false);

    // 5. Покупатель кликает «Оформить».
    submitButton().click();
    await new Promise((r) => setTimeout(r, 10));

    // 6. Цепочка запросов — customer → address → checkout → create-payment
    // (БЕЗ /delivery/select — это не ПВЗ), оплата по orderId ('order-1'), не по cartId.
    expect(
      urlsOf(fetchMock).filter((u) => !/\/delivery\/calculate/.test(u)),
    ).toEqual([
      "https://gateway.test/api/orders/cart/cart1/customer",
      "https://gateway.test/api/orders/cart/cart1/address",
      "https://gateway.test/api/orders/cart/cart1/checkout",
      "https://gateway.test/api/orders/order-1/create-payment",
    ]);

    // 7. metadata.deliveryMethod целиком — то, что реально выбрал покупатель кликом.
    expect(bodyOf(fetchMock, /\/checkout$/).metadata.deliveryMethod).toEqual({
      type: "cdek_door",
      carrier: "cdek",
      mode: "door",
      requiresPickupPoint: false,
      shipmentRequired: true,
      label: "Курьер СДЭК до двери",
      costCents: 35000,
      tariffCode: "137",
      customTariffId: null,
      pickupPointId: null,
      pickupPointCode: null,
      pickupPointAddress: null,
      periodMin: 1,
      periodMax: 3,
    });
  });

  it("ПВЗ СДЭК: кнопка неактивна без точки → выбор точки в пикере → активна → /delivery/select уходит РАНЬШЕ /checkout", async () => {
    const fetchMock = jest.fn((url: string) => {
      if (/\/delivery\/pickup-points/.test(url))
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: [{ code: "PVZ-9", address: "ул. Складская, 9", type: "PVZ" }],
          }),
        });
      if (/\/delivery\/calculate/.test(url))
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              deliveryOptions: [
                {
                  id: "pvz1",
                  name: "неважно",
                  type: "PARTNER",
                  price: 300,
                  minDays: 2,
                  maxDays: 5,
                  description: "",
                  carrier: "cdek",
                  mode: "pickup",
                  tariffCode: "138",
                  requiresPickupPoint: true,
                  shipmentRequired: true,
                  pickupPointKind: "PVZ",
                  label: "Пункт выдачи СДЭК",
                },
              ],
              pickupPoints: [],
            },
          }),
        });
      if (/\/delivery\/select$/.test(url))
        return Promise.resolve({ ok: true, json: async () => ({ data: {} }) });
      if (/\/customer$/.test(url))
        return Promise.resolve({ ok: true, json: async () => ({}) });
      if (/\/address$/.test(url))
        return Promise.resolve({ ok: true, json: async () => ({}) });
      if (/\/checkout$/.test(url))
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: { orderId: "order-2" } }),
        });
      if (/\/create-payment$/.test(url))
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: { confirmationUrl: "https://pay.test/pvz" },
          }),
        });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    (window as any).fetch = fetchMock;
    mountDom();
    runBothBlocks();
    jest.useRealTimers(); // безопасно снимать фейковые таймеры ЗДЕСЬ — safety-net уже погашен внутри runBothBlocks()

    // 1. Адрес.
    customerEntersAddress({ cityFiasId: "fias-msk", postalCode: "101000" });
    await tick();

    // 2. Единственный тариф — ПВЗ СДЭК, авто-выбран → пикер раскрылся, точки грузятся.
    const card = document.querySelector(
      '[data-delivery-type="cdek_pickup"]',
    ) as HTMLElement;
    expect(card).not.toBeNull();
    await tick(); // fetch pickup-points долетел

    // 3. Кнопка «Оформить» НЕДОСТУПНА — точка ещё не выбрана.
    expect(submitButton().disabled).toBe(true);

    // 4. Покупатель выбирает точку в пикере.
    const row = document.querySelector("[data-pvz-row]") as HTMLElement;
    expect(row.getAttribute("data-pvz-code")).toBe("PVZ-9");
    row.click();

    // 5. Кнопка «Оформить» стала активной.
    expect(submitButton().disabled).toBe(false);

    // 6. Покупатель оформляет заказ.
    submitButton().click();
    await new Promise((r) => setTimeout(r, 10));

    // 7. /delivery/select (с кодом точки) уходит РАНЬШЕ /checkout.
    const urls = urlsOf(fetchMock).filter(
      (u) => !/\/delivery\/(calculate|pickup-points)/.test(u),
    );
    const selectIdx = urls.findIndex((u) => /\/delivery\/select$/.test(u));
    const checkoutIdx = urls.findIndex((u) => /\/checkout$/.test(u));
    expect(selectIdx).toBeGreaterThanOrEqual(0);
    expect(checkoutIdx).toBeGreaterThan(selectIdx);

    const selectBody = bodyOf(fetchMock, /\/delivery\/select$/);
    expect(selectBody.pickupPointCode).toBe("PVZ-9");
    expect(selectBody.pickupPointAddress).toBe("ул. Складская, 9");

    // Оплата по orderId ('order-2'), не по cartId ('cart1').
    expect(urls.at(-1)).toBe(
      "https://gateway.test/api/orders/order-2/create-payment",
    );
  });
});
